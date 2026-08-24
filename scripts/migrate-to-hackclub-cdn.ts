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

const headers: HeadersInit = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
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

      const cdnKey = process.env.HACK_CLUB_CDN_API_KEY || process.env.HACK_CLUB_API_KEY;
      const authHeaders: HeadersInit = cdnKey && !cdnKey.includes("your-") ? { Authorization: `Bearer ${cdnKey}` } : {};

      // 1. Download file from Supabase Storage (trying public URL first, then authenticated URL with headers)
      let audioRes = await fetch(originalUrl);
      if (!audioRes.ok && originalUrl.includes("supabase")) {
        const authenticatedUrl = originalUrl.replace("/object/public/", "/object/authenticated/");
        audioRes = await fetch(authenticatedUrl, { headers });
      }

      if (!audioRes.ok) {
        if (audioRes.status === 404) {
          console.log(`   ℹ️ Storage object missing in Supabase (Status 404). Skipping.`);
          failed++;
          continue;
        }
        throw new Error(`Failed to download from Supabase Storage: status ${audioRes.status}`);
      }

      const audioBlob = await audioRes.blob();
      fileSize = audioBlob.size;

      const formData = new FormData();
      formData.append("file", audioBlob, fileName);

      const cdnRes = await fetch("https://cdn.hackclub.com/api/v4/upload", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });

      if (!cdnRes.ok) {
        throw new Error(`Hack Club CDN status ${cdnRes.status}`);
      }

      const cdnData = await cdnRes.json();
      newCdnUrl = cdnData.url || "";

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
