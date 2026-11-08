/**
 * Uploads audio to Hack Club CDN with an automatic zero-quota Supabase staging bridge.
 * 
 * - For files <= 3.5 MB: Uploads directly to /api/cdn-upload via FormData.
 * - For files > 3.5 MB (or if direct upload encounters Vercel's 4.5 MB 413 limit):
 *   1. Obtains a presigned staging URL from /api/cdn-upload.
 *   2. Directly uploads from browser -> Supabase Storage (bypassing Vercel's 4.5 MB proxy limit).
 *   3. Calls /api/cdn-upload to trigger Hack Club CDN's upload_from_url.
 *   4. The server immediately deletes the staging file from Supabase Storage (retaining 0 bytes).
 *   5. Permanent audio is hosted on Hack Club CDN with 100% free Supabase storage.
 */

export interface UploadCdnResult {
  url: string;
  provider: string;
  size?: number;
}

export async function uploadAudioToCdn(
  blob: Blob,
  fileName: string,
  mimeType: string,
  supabaseClient: any
): Promise<UploadCdnResult> {
  const DIRECT_UPLOAD_LIMIT = 3.5 * 1024 * 1024; // 3.5 MB safe limit for Vercel Serverless

  // 1. Direct fast path for small recordings (under 3.5 MB)
  if (blob.size <= DIRECT_UPLOAD_LIMIT) {
    try {
      const cdnFormData = new FormData();
      cdnFormData.append("file", blob, fileName);

      const res = await fetch("/api/cdn-upload", {
        method: "POST",
        body: cdnFormData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          return {
            url: data.url,
            provider: data.provider || "hackclub_cdn",
            size: blob.size,
          };
        }
      }

      // If Vercel returned 413 or another server error, log and seamlessly fall through to staging bridge
      if (res.status === 413) {
        console.warn(`[CDN Upload] Vercel rejected ${fileName} (${(blob.size / 1024 / 1024).toFixed(2)} MB) with 413. Switching to zero-quota staging bridge...`);
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.warn(`[CDN Upload] Direct upload failed with status ${res.status} (${errJson.error || "unknown"}). Attempting staging bridge...`);
      }
    } catch (directErr) {
      console.warn("[CDN Upload] Direct upload network failure, attempting staging bridge:", directErr);
    }
  }

  // 2. Large file or direct upload fallback: Zero-Quota Supabase Staging Bridge
  console.log(`[CDN Upload] Using zero-quota staging bridge for "${fileName}" (${(blob.size / 1024 / 1024).toFixed(2)} MB)...`);

  // Step A: Request staging parameters & presigned upload token from server
  const initRes = await fetch("/api/cdn-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "get-staging-url",
      fileName,
    }),
  });

  if (!initRes.ok) {
    const errData = await initRes.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to initialize CDN staging session (status ${initRes.status})`);
  }

  const { stagingPath, signedUrl, token } = await initRes.json();
  if (!stagingPath) {
    throw new Error("Server failed to generate a staging path for Hack Club CDN upload.");
  }

  // Step B: Upload file directly from browser to Supabase Storage (bypasses Vercel's 4.5 MB limit)
  let uploadSucceeded = false;
  let lastStorageErr = "";

  // Attempt B1: Upload via Supabase uploadToSignedUrl if token is provided
  if (token && supabaseClient?.storage?.from) {
    try {
      const bucket = supabaseClient.storage.from("audio_journals");
      if (typeof bucket.uploadToSignedUrl === "function") {
        const { error: signedErr } = await bucket.uploadToSignedUrl(stagingPath, token, blob, {
          contentType: mimeType || "audio/wav",
        });
        if (!signedErr) {
          uploadSucceeded = true;
        } else {
          lastStorageErr = signedErr.message;
          console.warn("[CDN Upload] uploadToSignedUrl error:", signedErr);
        }
      }
    } catch (e: any) {
      lastStorageErr = e?.message || String(e);
    }
  }

  // Attempt B2: Direct PUT to signedUrl (standard S3/Supabase presigned upload)
  if (!uploadSucceeded && signedUrl) {
    try {
      const putRes = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mimeType || "audio/wav",
        },
        body: blob,
      });

      if (putRes.ok) {
        uploadSucceeded = true;
      } else {
        const errText = await putRes.text().catch(() => "");
        lastStorageErr = `Signed URL PUT failed with status ${putRes.status}: ${errText}`;
        console.warn("[CDN Upload] Signed URL PUT error:", lastStorageErr);
      }
    } catch (e: any) {
      lastStorageErr = e?.message || String(e);
    }
  }

  // Attempt B3: Standard authenticated Supabase storage upload
  if (!uploadSucceeded && supabaseClient?.storage?.from) {
    try {
      const { error: standardErr } = await supabaseClient.storage
        .from("audio_journals")
        .upload(stagingPath, blob, {
          contentType: mimeType || "audio/wav",
          upsert: true,
        });

      if (!standardErr) {
        uploadSucceeded = true;
      } else {
        lastStorageErr = standardErr.message;
        console.warn("[CDN Upload] Standard supabase upload error:", standardErr);
      }
    } catch (e: any) {
      lastStorageErr = e?.message || String(e);
    }
  }

  if (!uploadSucceeded) {
    throw new Error(`Failed to stage audio for Hack Club CDN: ${lastStorageErr || "Upload could not be established."}`);
  }

  // Step C: Instruct server to fetch from staging into Hack Club CDN and immediately purge staging
  const completeRes = await fetch("/api/cdn-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "complete-staging",
      stagingPath,
      fileName,
    }),
  });

  if (!completeRes.ok) {
    const errData = await completeRes.json().catch(() => ({}));
    throw new Error(errData.error || `Hack Club CDN ingestion failed (status ${completeRes.status})`);
  }

  const finalData = await completeRes.json();
  if (!finalData.url) {
    throw new Error("Hack Club CDN did not return a valid public audio URL.");
  }

  return {
    url: finalData.url,
    provider: finalData.provider || "hackclub_cdn",
    size: blob.size,
  };
}

