import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

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

    console.log(`[CDN Upload] Starting Hack Club CDN upload for user ${user.id}: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    // 3. Attempt upload to Hack Club CDN (https://cdn.hackclub.com/api/new)
    let cdnUrl = "";
    let uploadSuccess = false;

    try {
      const cdnFormData = new FormData();
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: mimeType });
      cdnFormData.append("file", blob, fileName);

      const cdnHeaders: HeadersInit = {};
      const hackClubCdnKey = process.env.HACK_CLUB_CDN_API_KEY || process.env.HACK_CLUB_API_KEY;
      if (hackClubCdnKey && !hackClubCdnKey.includes("your-")) {
        cdnHeaders["Authorization"] = `Bearer ${hackClubCdnKey}`;
      }

      const cdnResponse = await fetch("https://cdn.hackclub.com/api/v4/upload", {
        method: "POST",
        headers: cdnHeaders,
        body: cdnFormData,
      });

      if (cdnResponse.ok) {
        const cdnData = await cdnResponse.json();
        cdnUrl = cdnData.url || "";

        if (cdnUrl) {
          uploadSuccess = true;
          console.log(`[CDN Upload] Successfully uploaded to Hack Club CDN v4: ${cdnUrl}`);
        }
      } else {
        console.warn(`[CDN Upload] Hack Club CDN status ${cdnResponse.status}, falling back to Supabase Storage.`);
      }
    } catch (cdnErr) {
      console.warn("[CDN Upload] Hack Club CDN upload failed, executing fallback to Supabase Storage:", cdnErr);
    }

    // 4. Fallback to Supabase Storage if Hack Club CDN failed
    if (!uploadSuccess) {
      const adminSupabase = createAdminClient();
      const storagePath = `${user.id}/${Date.now()}_${fileName}`;
      
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await adminSupabase.storage
        .from("audio_journals")
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Fallback Supabase Storage upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = adminSupabase.storage
        .from("audio_journals")
        .getPublicUrl(storagePath);

      cdnUrl = urlData.publicUrl;
      console.log(`[CDN Upload] Fallback upload to Supabase Storage successful: ${cdnUrl}`);
    }

    return NextResponse.json(
      {
        url: cdnUrl,
        size: fileSize,
        provider: uploadSuccess ? "hackclub_cdn" : "supabase_storage",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("CDN Upload API error:", err);
    return NextResponse.json({ error: `Upload error: ${err.message || err}` }, { status: 500 });
  }
}
