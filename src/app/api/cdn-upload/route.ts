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

    const hackClubCdnKey = process.env.HACK_CLUB_CDN_API_KEY;
    if (!hackClubCdnKey || hackClubCdnKey.includes("your-") || !hackClubCdnKey.startsWith("sk_cdn_")) {
      return NextResponse.json({
        error: "Configuration Error: HACK_CLUB_CDN_API_KEY is missing or invalid in server environment. Supabase storage fallback is disabled to keep Supabase 100% free.",
      }, { status: 500 });
    }

    const contentType = request.headers.get("content-type") || "";

    // =========================================================================
    // BRANCH A: JSON Staging Bridge Requests
    // =========================================================================
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      const action = body.action || (body.stagingPath ? "complete-staging" : "unknown");
      const adminSupabase = createAdminClient();

      // Action 1: Generate signed upload URL for zero-quota staging in Supabase
      if (action === "get-staging-url") {
        try {
          // Ensure audio_journals bucket exists and is public
          const { data: bucket } = await adminSupabase.storage.getBucket("audio_journals");
          if (!bucket) {
            await adminSupabase.storage.createBucket("audio_journals", {
              public: true,
              fileSizeLimit: 52428800, // 50MB
            });
          }
        } catch (bErr) {
          console.warn("[CDN Upload] Bucket ensure warning:", bErr);
        }

        const rawFileName = body.fileName || "audio.wav";
        const safeName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const stagingPath = `staging/${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}-${safeName}`;

        let signedUrl = "";
        let token = "";
        try {
          const { data: signedUploadData, error: signedUploadError } = await adminSupabase.storage
            .from("audio_journals")
            .createSignedUploadUrl(stagingPath);

          if (!signedUploadError && signedUploadData) {
            signedUrl = signedUploadData.signedUrl;
            token = signedUploadData.token;
          }
        } catch (signErr) {
          console.warn("[CDN Upload] Signed upload URL generation warning:", signErr);
        }

        return NextResponse.json({
          stagingPath,
          signedUrl,
          token,
        }, { status: 200 });
      }

      // Action 2: Hack Club CDN ingestion from staging URL + Immediate Purge
      if (action === "complete-staging") {
        const stagingPath = body.stagingPath as string;
        if (!stagingPath || typeof stagingPath !== "string") {
          return NextResponse.json({ error: "Missing stagingPath parameter" }, { status: 400 });
        }

        // Security check: ensure staging path belongs to this authenticated user
        if (!stagingPath.startsWith(`staging/${user.id}/`)) {
          return NextResponse.json({ error: "Forbidden: Staging path does not belong to user" }, { status: 403 });
        }

        // Generate download URL for Hack Club CDN server to fetch
        let downloadUrl = "";
        try {
          const { data: signedData } = await adminSupabase.storage
            .from("audio_journals")
            .createSignedUrl(stagingPath, 600); // 10 minutes
          if (signedData?.signedUrl) {
            downloadUrl = signedData.signedUrl;
          }
        } catch (sErr) {
          console.warn("[CDN Upload] Signed download URL generation warning:", sErr);
        }

        if (!downloadUrl) {
          const { data: publicData } = adminSupabase.storage
            .from("audio_journals")
            .getPublicUrl(stagingPath);
          downloadUrl = publicData.publicUrl;
        }

        if (!downloadUrl) {
          return NextResponse.json({ error: "Could not resolve staging download URL" }, { status: 500 });
        }

        console.log(`[CDN Upload] Triggering Hack Club CDN upload_from_url for staging path: ${stagingPath}`);

        let cdnUrl = "";
        let cdnSize = 0;
        let lastError = "";

        try {
          // Call Hack Club CDN upload_from_url with up to 3 retries
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const cdnResponse = await fetch("https://cdn.hackclub.com/api/v4/upload_from_url", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${hackClubCdnKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ url: downloadUrl }),
              });

              if (cdnResponse.ok) {
                const cdnData = await cdnResponse.json();
                cdnUrl = cdnData.url || "";
                cdnSize = cdnData.size || 0;
                if (cdnUrl) {
                  console.log(`[CDN Upload] Staging bridge successfully ingested to Hack Club CDN: ${cdnUrl}`);
                  break;
                }
              } else {
                const errBody = await cdnResponse.text().catch(() => "");
                lastError = `Status ${cdnResponse.status}: ${errBody}`;
                console.warn(`[CDN Upload] Staging bridge attempt ${attempt} failed: ${lastError}`);
              }
            } catch (cdnErr: any) {
              lastError = cdnErr?.message || String(cdnErr);
              console.warn(`[CDN Upload] Staging bridge attempt ${attempt} network error: ${lastError}`);
            }

            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, 1000 * attempt));
            }
          }
        } finally {
          // ALWAYS purge the staging file from Supabase Storage immediately
          // This guarantees that 0 MB storage quota is used on Supabase
          try {
            const { error: removeErr } = await adminSupabase.storage
              .from("audio_journals")
              .remove([stagingPath]);

            if (removeErr) {
              console.warn(`[CDN Upload] Staging purge error for ${stagingPath}:`, removeErr);
            } else {
              console.log(`[CDN Upload] Successfully deleted staging file ${stagingPath} from Supabase Storage (0 quota retained).`);
            }
          } catch (cleanupErr) {
            console.warn(`[CDN Upload] Failed to remove staging file:`, cleanupErr);
          }
        }

        if (!cdnUrl) {
          throw new Error(`Hack Club CDN ingestion failed (${lastError}). Please check Hack Club CDN API status.`);
        }

        return NextResponse.json({
          url: cdnUrl,
          size: cdnSize,
          provider: "hackclub_cdn",
        }, { status: 200 });
      }

      return NextResponse.json({ error: `Unknown staging action: ${action}` }, { status: 400 });
    }

    // =========================================================================
    // BRANCH B: Direct Multipart Form-Data Upload (Fast path for <= 3.5 MB)
    // =========================================================================
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided in request" }, { status: 400 });
    }

    const fileSize = file.size;
    const fileName = file.name || `audio-${Date.now()}.webm`;
    const mimeType = file.type || "audio/webm";

    console.log(`[CDN Upload] Direct Hack Club CDN upload for user ${user.id}: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    const arrayBuffer = await file.arrayBuffer();
    let cdnUrl = "";
    let lastError = "";

    // Attempt direct upload to Hack Club CDN with 3 retries
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
