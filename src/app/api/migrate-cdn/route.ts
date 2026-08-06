import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate User
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    // 2. Fetch logs that require CDN migration
    const { data: logs, error: logsError } = await adminSupabase
      .from("journal_logs")
      .select("*")
      .eq("user_id", user.id);

    if (logsError || !logs) {
      return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
    }

    const unmigratedLogs = logs.filter((log) => {
      const url = log.audio_url || "";
      if (!url || url.includes("cdn.hackclub.com")) return false;
      if (url === "text_journal" || url === "daily_journal" || url === "past_hours_journal" || url === "knowledge_base" || url === "settings_profile") {
        return false;
      }
      return true;
    });

    if (unmigratedLogs.length === 0) {
      return NextResponse.json({
        message: "All audio entries are already migrated to Hack Club CDN!",
        totalToMigrate: 0,
        migratedCount: 0,
        bytesFreed: 0,
      });
    }

    console.log(`[CDN Migration API] Starting migration for ${unmigratedLogs.length} entries for user ${user.id}...`);

    let migratedCount = 0;
    let failedCount = 0;
    let bytesFreed = 0;
    const migrationLogResults: any[] = [];

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const headers: HeadersInit = {};
    if (serviceKey) {
      headers["apikey"] = serviceKey;
      headers["Authorization"] = `Bearer ${serviceKey}`;
    } else if (anonKey) {
      headers["apikey"] = anonKey;
      headers["Authorization"] = `Bearer ${anonKey}`;
    }

    for (const log of unmigratedLogs) {
      try {
        const originalUrl = log.audio_url;
        const urlObj = new URL(originalUrl);
        const pathParts = urlObj.pathname.split("/audio_journals/");
        const storagePath = pathParts.length >= 2 ? decodeURIComponent(pathParts[1]) : "";
        const extension = storagePath.split(".").pop()?.toLowerCase() || "webm";
        const fileName = `migrated-${log.id}.${extension}`;

        let newCdnUrl = "";
        let fileSize = 0;

        const cdnKey = process.env.HACK_CLUB_CDN_API_KEY || process.env.HACK_CLUB_API_KEY;
        const authHeaders: HeadersInit = cdnKey && !cdnKey.includes("your-") ? { Authorization: `Bearer ${cdnKey}` } : {};

        // 1. Try Hack Club CDN v4 upload_from_url first
        try {
          const urlRes = await fetch("https://cdn.hackclub.com/api/v4/upload_from_url", {
            method: "POST",
            headers: {
              ...authHeaders,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: originalUrl }),
          });

          if (urlRes.ok) {
            const urlData = await urlRes.json();
            if (urlData.url) {
              newCdnUrl = urlData.url;
              fileSize = urlData.size || 0;
              console.log(`[CDN Migration] Migrated via v4 upload_from_url: ${newCdnUrl}`);
            }
          }
        } catch (urlErr) {
          console.warn("[CDN Migration] upload_from_url failed, falling back to direct upload:", urlErr);
        }

        // 2. Fallback to direct file upload if upload_from_url failed
        if (!newCdnUrl) {
          let audioRes = await fetch(originalUrl);
          if (!audioRes.ok) {
            audioRes = await fetch(originalUrl, { headers });
          }

          if (!audioRes.ok) {
            if (audioRes.status === 400 || audioRes.status === 404) {
              const customTags = log.custom_tags || [];
              if (!customTags.includes("_storage:cleared")) customTags.push("_storage:cleared");

              await adminSupabase
                .from("journal_logs")
                .update({
                  audio_url: "daily_journal",
                  custom_tags: customTags,
                })
                .eq("id", log.id);

              migratedCount++;
              continue;
            }
            throw new Error(`Failed to download from Supabase Storage: ${audioRes.status}`);
          }

          const audioBlob = await audioRes.blob();
          fileSize = audioBlob.size;

          const cdnFormData = new FormData();
          cdnFormData.append("file", audioBlob, fileName);

          const cdnRes = await fetch("https://cdn.hackclub.com/api/v4/upload", {
            method: "POST",
            headers: authHeaders,
            body: cdnFormData,
          });

          if (!cdnRes.ok) {
            throw new Error(`Hack Club CDN upload returned status ${cdnRes.status}`);
          }

          const cdnData = await cdnRes.json();
          newCdnUrl = cdnData.url || "";
        }

        if (!newCdnUrl) {
          throw new Error("Hack Club CDN did not return a valid URL");
        }

        // Update Database record
        const customTags = log.custom_tags || [];
        if (!customTags.includes("_storage:hackclub_cdn")) {
          customTags.push("_storage:hackclub_cdn");
        }
        if (!customTags.some((t: string) => t.startsWith("_filesize:"))) {
          customTags.push(`_filesize:${fileSize}`);
        }

        const { error: updateError } = await adminSupabase
          .from("journal_logs")
          .update({
            audio_url: newCdnUrl,
            custom_tags: customTags,
          })
          .eq("id", log.id);

        if (updateError) {
          throw updateError;
        }

        // Delete original file from Supabase storage bucket to free quota
        if (storagePath) {
          await adminSupabase.storage
            .from("audio_journals")
            .remove([storagePath])
            .catch((delErr) => {
              console.warn(`Could not delete storage file ${storagePath}:`, delErr);
            });
        }

        migratedCount++;
        bytesFreed += fileSize;
        migrationLogResults.push({
          id: log.id,
          title: log.ai_title || "Untitled",
          oldUrl: originalUrl,
          newUrl: newCdnUrl,
          sizeMB: (fileSize / (1024 * 1024)).toFixed(2),
          status: "success",
        });

      } catch (itemErr: any) {
        console.error(`Migration failed for log ${log.id}:`, itemErr);
        failedCount++;
        migrationLogResults.push({
          id: log.id,
          title: log.ai_title || "Untitled",
          status: "failed",
          error: itemErr.message || String(itemErr),
        });
      }
    }

    return NextResponse.json(
      {
        totalToMigrate: unmigratedLogs.length,
        migratedCount,
        failedCount,
        bytesFreed,
        freedMB: (bytesFreed / (1024 * 1024)).toFixed(2),
        results: migrationLogResults,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("CDN Migration API error:", err);
    return NextResponse.json({ error: `Migration error: ${err.message || err}` }, { status: 500 });
  }
}
