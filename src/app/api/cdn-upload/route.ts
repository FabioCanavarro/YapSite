import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse uploaded FormData
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided in request" }, { status: 400 });
    }

    const fileSize = file.size;
    const fileName = file.name || `audio-${Date.now()}.webm`;
    const mimeType = file.type || "audio/webm";

    console.log(`[CDN Upload] Force Hack Club CDN upload for user ${user.id}: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    const hackClubCdnKey = process.env.HACK_CLUB_CDN_API_KEY;
    if (!hackClubCdnKey || hackClubCdnKey.includes("your-") || !hackClubCdnKey.startsWith("sk_cdn_")) {
      return NextResponse.json({
        error: "Configuration Error: HACK_CLUB_CDN_API_KEY is missing or invalid in server environment. Supabase storage fallback is disabled to keep Supabase 100% free.",
      }, { status: 500 });
    }

    const arrayBuffer = await file.arrayBuffer();
    let cdnUrl = "";
    let lastError = "";

    // 3. Attempt upload to Hack Club CDN with 3 retries
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const cdnFormData = new FormData();
        const blob = new Blob([arrayBuffer], { type: mimeType });
        cdnFormData.append("file", blob, fileName);

        const cdnResponse = await fetch("https://cdn.hackclub.com/api/v4/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hackClubCdnKey}`,
          },
          body: cdnFormData,
        });

        if (cdnResponse.ok) {
          const cdnData = await cdnResponse.json();
          cdnUrl = cdnData.url || "";
          if (cdnUrl) {
            console.log(`[CDN Upload] Successfully uploaded to Hack Club CDN v4: ${cdnUrl}`);
            break;
          }
        } else {
          const errBody = await cdnResponse.text().catch(() => "");
          lastError = `Status ${cdnResponse.status}: ${errBody}`;
          console.warn(`[CDN Upload] Attempt ${attempt} failed: ${lastError}`);
        }
      } catch (cdnErr: any) {
        lastError = cdnErr?.message || String(cdnErr);
        console.warn(`[CDN Upload] Attempt ${attempt} network error: ${lastError}`);
      }

      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    if (!cdnUrl) {
      throw new Error(`Hack Club CDN upload failed after 3 attempts (${lastError}). Supabase Storage fallback is disabled to prevent quota exhaustion.`);
    }

    return NextResponse.json(
      {
        url: cdnUrl,
        size: fileSize,
        provider: "hackclub_cdn",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("CDN Upload API error:", err);
    return NextResponse.json({ error: `Upload error: ${err.message || err}` }, { status: 502 });
  }
}
