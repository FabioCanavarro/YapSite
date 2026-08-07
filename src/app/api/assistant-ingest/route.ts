import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication Check
    // Support Bearer Token (Supabase JWT) or static secret (for Tasker)
    const authHeader = request.headers.get("Authorization");
    const ingestSecretHeader = request.headers.get("X-Ingest-Token");
    const urlParams = request.nextUrl.searchParams;
    const urlToken = urlParams.get("token");

    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const staticToken = ingestSecretHeader || urlToken;

    let userId: string | null = null;
    const adminSupabase = createAdminClient();

    if (token) {
      // Authenticate token against Supabase Auth
      const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized: Invalid JWT token" }, { status: 401 });
      }
      userId = user.id;
    } else if (staticToken) {
      // Check static secret token configured in Env variables
      const configuredSecret = process.env.INGEST_API_SECRET;
      if (!configuredSecret || staticToken !== configuredSecret) {
        return NextResponse.json({ error: "Unauthorized: Invalid Secret Token" }, { status: 401 });
      }
      
      // For static token, expect user ID in X-User-Id header or parameter
      const requestedUserId = request.headers.get("X-User-Id") || urlParams.get("userId");
      if (!requestedUserId) {
        return NextResponse.json({ error: "Bad Request: X-User-Id header or userId query param is required when using static token" }, { status: 400 });
      }
      userId = requestedUserId;
    } else {
      return NextResponse.json({ error: "Unauthorized: Missing authentication credentials" }, { status: 401 });
    }

    // 2. Parse Multipart Audio File
    const formData = await request.formData();
    const file = formData.get("audio") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Bad Request: Missing audio file in 'audio' field" }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = file.type || "audio/wav";

    // 3. Upload to Hack Club CDN (v4 API) with Supabase Fallback
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const fileExtension = file.name.split(".").pop() || "wav";
    const fileName = `${userId}/${timestamp}-${randomStr}.${fileExtension}`;

    let audioUrl = "";
    try {
      const cdnFormData = new FormData();
      const blob = new Blob([buffer], { type: mimeType });
      cdnFormData.append("file", blob, `ingest-${timestamp}.${fileExtension}`);

      const cdnHeaders: HeadersInit = {};
      const cdnKey = process.env.HACK_CLUB_CDN_API_KEY || process.env.HACK_CLUB_API_KEY;
      if (cdnKey && !cdnKey.includes("your-")) {
        cdnHeaders["Authorization"] = `Bearer ${cdnKey}`;
      }

      const cdnRes = await fetch("https://cdn.hackclub.com/api/v4/upload", {
        method: "POST",
        headers: cdnHeaders,
        body: cdnFormData,
      });

      if (cdnRes.ok) {
        const cdnJson = await cdnRes.json();
        audioUrl = cdnJson.url || "";
        console.log(`[Assistant Ingest] Uploaded to Hack Club CDN v4: ${audioUrl}`);
      }
    } catch (cdnErr) {
      console.warn("[Assistant Ingest] CDN upload failed, executing fallback:", cdnErr);
    }

    if (!audioUrl) {
      const { data: uploadData, error: uploadError } = await adminSupabase.storage
        .from("audio_journals")
        .upload(fileName, buffer, {
          contentType: mimeType,
          duplex: "half",
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
      }

      const { data: urlData } = adminSupabase.storage
        .from("audio_journals")
        .getPublicUrl(fileName);

      audioUrl = urlData.publicUrl;
    }

    // 5. Create Pending Database Row
    const { data: dbData, error: dbError } = await adminSupabase
      .from("journal_logs")
      .insert({
        user_id: userId,
        audio_url: audioUrl,
        processing_status: "pending",
        ai_title: "Ingested Voice Entry",
        ai_mood_color: "#313244", // default surface color
        raw_transcript: "Processing in progress...",
        tidied_log: "Your journal is processing and will be available shortly.",
        ai_tags: ["Pending"],
        custom_tags: [],
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database insert error:", dbError);
      return NextResponse.json({ error: `Database logging failed: ${dbError.message}` }, { status: 500 });
    }

    // 6. Return 200 OK immediately
    return NextResponse.json({
      message: "Audio ingested successfully",
      logId: dbData.id,
      status: "pending",
    }, { status: 200 });

  } catch (err: any) {
    console.error("Ingestion API error:", err);
    return NextResponse.json({ error: `Internal Server Error: ${err.message || err}` }, { status: 500 });
  }
}
