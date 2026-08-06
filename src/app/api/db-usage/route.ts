import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all logs for the authenticated user
    const { data: logs, error: logsError } = await supabase
      .from("journal_logs")
      .select("id, audio_url, custom_tags, processing_status, created_at")
      .eq("user_id", user.id);

    if (logsError) {
      throw logsError;
    }

    const allLogs = logs || [];
    
    let textJournalsCount = 0;
    let audioJournalsCount = 0;
    let hackClubCdnCount = 0;
    let supabaseStorageCount = 0;
    
    let totalAudioSizeBytes = 0;
    let supabaseStorageBytes = 0;
    let hackClubCdnBytes = 0;

    for (const log of allLogs) {
      const url = log.audio_url || "";
      
      // Check if text or audio journal
      if (url === "text_journal" || url === "daily_journal" || url === "past_hours_journal" || url === "knowledge_base" || url === "settings_profile") {
        textJournalsCount++;
        continue;
      }

      audioJournalsCount++;

      // Extract file size from custom tags if present
      const sizeTag = log.custom_tags?.find((t: string) => t.startsWith("_filesize:"));
      let bytes = 0;
      if (sizeTag) {
        const parsed = parseInt(sizeTag.split(":")[1], 10);
        if (!isNaN(parsed) && parsed > 0) {
          bytes = parsed;
        }
      }

      // Default estimate 3.5 MB per audio log if tag missing
      if (bytes === 0) {
        bytes = 3.5 * 1024 * 1024;
      }

      totalAudioSizeBytes += bytes;

      if (url.includes("cdn.hackclub.com")) {
        hackClubCdnCount++;
        hackClubCdnBytes += bytes;
      } else {
        supabaseStorageCount++;
        supabaseStorageBytes += bytes;
      }
    }

    let cdnQuotaInfo: any = null;
    const cdnKey = process.env.HACK_CLUB_CDN_API_KEY || process.env.HACK_CLUB_API_KEY;
    if (cdnKey && !cdnKey.includes("your-")) {
      try {
        const meRes = await fetch("https://cdn.hackclub.com/api/v4/me", {
          headers: { Authorization: `Bearer ${cdnKey}` },
        });
        if (meRes.ok) {
          cdnQuotaInfo = await meRes.json();
        }
      } catch (e) {}
    }

    return NextResponse.json(
      {
        totalLogs: allLogs.length,
        textJournalsCount,
        audioJournalsCount,
        hackClubCdnCount,
        supabaseStorageCount,
        totalAudioSizeBytes,
        supabaseStorageBytes,
        hackClubCdnBytes,
        totalAudioSizeMB: (totalAudioSizeBytes / (1024 * 1024)).toFixed(2),
        supabaseStorageMB: (supabaseStorageBytes / (1024 * 1024)).toFixed(2),
        hackClubCdnMB: (hackClubCdnBytes / (1024 * 1024)).toFixed(2),
        percentMigrated: audioJournalsCount > 0 ? Math.round((hackClubCdnCount / audioJournalsCount) * 100) : 100,
        cdnQuotaInfo,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("DB usage API error:", err);
    const errMsg = err.message || String(err);
    const isQuotaExceeded = errMsg.includes("exceed_storage_size_quota") || errMsg.includes("402");

    return NextResponse.json({
      error: errMsg,
      isQuotaExceeded,
      message: isQuotaExceeded
        ? "Supabase storage quota exceeded (Project restricted). Please lift spend cap in Supabase or migrate storage."
        : errMsg,
    }, { status: 200 });
  }
}
