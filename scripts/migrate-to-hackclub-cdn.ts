import * as fs from "fs";
import * as path from "path";

// Natively load .env and .env.local variables relative to project root
[".env", ".env.local"].forEach((envFile) => {
  try {
    const envPath = path.resolve(__dirname, "..", envFile);
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      envContent.split("\n").forEach((line) => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || "";
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          if (!process.env[key]) process.env[key] = value.trim();
        }
      });
    }
  } catch (e) {}
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env!");
  process.exit(1);
}

const activeKey: string = serviceRoleKey;

const headers: Record<string, string> = {
  apikey: activeKey,
  Authorization: `Bearer ${activeKey}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function runMigration() {
  console.log("==================================================");
  console.log("🚀 YapSite Audio Storage -> Hack Club CDN Migration");
  console.log("==================================================\n");

  let logs: any[] = [];
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/journal_logs?select=*`, { headers });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Failed to fetch logs (Status ${response.status}):`, errText);
      process.exit(1);
    }
    logs = await response.json();
  } catch (err: any) {
    console.error("❌ Connection error fetching logs:", err);
    process.exit(1);
  }

  const pendingMigration = logs.filter((log) => {
    const url = log.audio_url || "";
    if (!url || url.includes("cdn.hackclub.com")) return false;
    if (url === "text_journal" || url === "daily_journal" || url === "past_hours_journal" || url === "knowledge_base" || url === "settings_profile") {
      return false;
    }
    const customTags = log.custom_tags || [];
    if (customTags.includes("_storage:missing")) return false;
    return true;
  });

  console.log(`📊 Found ${logs.length} total database records.`);
  console.log(`📦 ${pendingMigration.length} audio entries require migration to Hack Club CDN.\n`);

  if (pendingMigration.length === 0) {
    console.log("✨ All audio entries are already hosted on Hack Club CDN! No action needed.");
    process.exit(0);
  }

  let migrated = 0;
  let failed = 0;
  let bytesFreed = 0;

  for (let i = 0; i < pendingMigration.length; i++) {
    const log = pendingMigration[i];
    console.log(`[${i + 1}/${pendingMigration.length}] Processing: "${log.ai_title || "Untitled"}" (${log.id})`);

    try {
      const originalUrl = log.audio_url;
      console.log(`   🔗 URL: "${originalUrl}"`);
      const urlObj = new URL(originalUrl);
      const pathParts = urlObj.pathname.split("/audio_journals/");
      const storagePath = pathParts.length >= 2 ? decodeURIComponent(pathParts[1]) : "";
      const extension = storagePath.split(".").pop()?.toLowerCase() || "webm";
      const fileName = `migrated-${log.id}.${extension}`;

      let newCdnUrl = "";
      let fileSize = 0;

      const cdnKey = process.env.HACK_CLUB_CDN_API_KEY;
      if (!cdnKey || cdnKey.includes("your-") || !cdnKey.startsWith("sk_cdn_")) {
        throw new Error("HACK_CLUB_CDN_API_KEY is missing or invalid (must start with 'sk_cdn_')");
      }

      // Try direct upload_from_url with a Supabase signed URL (bypasses local memory & WAF body limits)
      let uploadFromUrlSuccess = false;
      if (storagePath) {
        try {
          const formattedStoragePath = storagePath.split("/").map(encodeURIComponent).join("/");
          const supabaseRest = await fetch(`${supabaseUrl}/storage/v1/object/sign/audio_journals/${formattedStoragePath}`, {
            method: "POST",
            headers: {
              apikey: serviceRoleKey || "",
              Authorization: `Bearer ${serviceRoleKey || ""}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ expiresIn: 3600 }),
          });

          if (supabaseRest.ok) {
            const signData = await supabaseRest.json();
            const signedPath = signData.signedURL || signData.signedUrl;
            const signedUrl = signedPath
              ? (signedPath.startsWith("http") ? signedPath : `${supabaseUrl}/storage/v1${signedPath}`)
              : "";

            if (signedUrl) {
              const fromUrlRes = await fetch("https://cdn.hackclub.com/api/v4/upload_from_url", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${cdnKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ url: signedUrl }),
              });

              if (fromUrlRes.ok) {
                const cdnData = await fromUrlRes.json();
                if (cdnData.url) {
                  newCdnUrl = cdnData.url;
                  fileSize = cdnData.size || 0;
                  uploadFromUrlSuccess = true;
                }
              } else {
                console.log(`   ⚠️ upload_from_url status: ${fromUrlRes.status} ${await fromUrlRes.text()}`);
              }
            } else {
              console.log(`   ⚠️ Could not extract signed URL from Supabase response:`, signData);
            }
          } else {
            console.log(`   ℹ️ Supabase sign URL status ${supabaseRest.status}`);
          }
        } catch (e: any) {
          console.log(`   ⚠️ upload_from_url error: ${e?.message || e}`);
        }
      }

      // Fallback to direct file download & upload
      if (!uploadFromUrlSuccess) {
        const downloadHeaders: HeadersInit = {
          apikey: serviceRoleKey || "",
          Authorization: `Bearer ${serviceRoleKey || ""}`,
        };

        let audioRes: Response | null = null;
        let lastFetchErr: any = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            audioRes = await fetch(originalUrl, { headers: downloadHeaders });
            if (!audioRes.ok && originalUrl.includes("supabase")) {
              const authenticatedUrl = originalUrl.replace("/object/public/", "/object/authenticated/");
              audioRes = await fetch(authenticatedUrl, { headers: downloadHeaders });
            }
            if (audioRes.ok || audioRes.status === 404 || audioRes.status === 400) break;
          } catch (retryErr) {
            lastFetchErr = retryErr;
            await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }

        if (!audioRes || !audioRes.ok) {
          console.log(`   ℹ️ Storage object missing in Supabase (Status: ${audioRes?.status || "error"}). Tagging entry ${log.id} as _storage:missing.`);
          const customTags = (log.custom_tags || []).filter((t: string) => t !== "_storage:cleared");
          if (!customTags.includes("_storage:missing")) customTags.push("_storage:missing");

          try {
            const patchRes = await fetch(`${supabaseUrl}/rest/v1/journal_logs?id=eq.${log.id}`, {
              method: "PATCH",
              headers,
              body: JSON.stringify({ custom_tags: customTags }),
            });
            if (!patchRes.ok) {
              console.log(`   ⚠️ DB PATCH status ${patchRes.status}: ${await patchRes.text()}`);
            }
          } catch (patchErr: any) {
            console.log(`   ⚠️ DB PATCH error: ${patchErr?.message || patchErr}`);
          }
          failed++;
          continue;
        }

        const arrayBuffer = await audioRes.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuffer);
        fileSize = audioBuffer.length;

        const authHeaders: HeadersInit = { Authorization: `Bearer ${cdnKey}` };
        const formData = new FormData();
        formData.append("file", new File([audioBuffer], fileName, { type: "audio/wav" }));

        let cdnRes: Response | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            cdnRes = await fetch("https://cdn.hackclub.com/api/v4/upload", {
              method: "POST",
              headers: authHeaders,
              body: formData,
            });
            if (cdnRes.ok) break;
            const textErr = await cdnRes.text().catch(() => "");
            console.log(`   ⚠️ CDN upload attempt ${attempt} status ${cdnRes.status}: ${textErr}`);
          } catch (cdnAttemptErr: any) {
            console.log(`   ⚠️ CDN upload attempt ${attempt} error: ${cdnAttemptErr?.message || cdnAttemptErr}`);
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }

        if (!cdnRes || !cdnRes.ok) {
          const errBody = cdnRes ? await cdnRes.text().catch(() => "") : "";
          throw new Error(`Hack Club CDN status ${cdnRes?.status || "failed"}${errBody ? `: ${errBody}` : ""}`);
        }

        const cdnData = await cdnRes.json();
        newCdnUrl = cdnData.url || "";
      }

      if (!newCdnUrl) {
        throw new Error("Hack Club CDN response did not contain a valid URL");
      }

      // Update DB record via direct REST call
      const customTags = (log.custom_tags || []).filter((t: string) => t !== "_storage:cleared");
      if (!customTags.includes("_storage:hackclub_cdn")) {
        customTags.push("_storage:hackclub_cdn");
      }
      if (!customTags.some((t: string) => t.startsWith("_filesize:"))) {
        customTags.push(`_filesize:${fileSize}`);
      }

      const updateRes = await fetch(`${supabaseUrl}/rest/v1/journal_logs?id=eq.${log.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          audio_url: newCdnUrl,
          custom_tags: customTags,
        }),
      });

      if (!updateRes.ok) {
        throw new Error(`Failed to update DB record: ${updateRes.status}`);
      }

      // Attempt to delete original file from Supabase storage bucket
      if (storagePath) {
        await fetch(`${supabaseUrl}/storage/v1/object/audio_journals/${storagePath}`, {
          method: "DELETE",
          headers,
        }).catch(() => {});
      }

      migrated++;
      bytesFreed += fileSize;
      console.log(`   ✅ Success! Migrated to ${newCdnUrl} (${(fileSize / 1024 / 1024).toFixed(2)} MB freed)`);

    } catch (err: any) {
      failed++;
      console.error(`   ❌ Failed to migrate entry ${log.id}:`, err.message || err);
    }
  }

  console.log("\n==================================================");
  console.log("🎉 Migration Summary:");
  console.log(`   Total Migrated : ${migrated}`);
  console.log(`   Failed Count   : ${failed}`);
  console.log(`   Space Freed    : ${(bytesFreed / (1024 * 1024)).toFixed(2)} MB`);
  console.log("==================================================");
}

runMigration();
