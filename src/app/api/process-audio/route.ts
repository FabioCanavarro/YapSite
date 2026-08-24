import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { activeEngine } from "@/config/ai-engine";
import { Readable } from "stream";
import { finished } from "stream/promises";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;

  try {
    // 1. Authenticate the User using active session cookies
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized: Please log in" }, { status: 401 });
    }

    // 2. Parse Request Parameters
    const body = await request.json();
    const { logId, removeFillerWords, enableSwearWords, customPrompt, language, customMoods, categories, tags } = body;

    if (!logId) {
      return NextResponse.json({ error: "Bad Request: Missing logId parameter" }, { status: 400 });
    }

    // 3. Fetch the Journal Log Row (using admin client to bypass any RLS fetch/update quirks while matching user_id for security)
    const adminSupabase = createAdminClient();
    const { data: log, error: logError } = await adminSupabase
      .from("journal_logs")
      .select("*")
      .eq("id", logId)
      .eq("user_id", user.id) // Ensure users can only process their own audio logs
      .single();

    if (logError || !log) {
      console.error("Fetch log error:", logError);
      return NextResponse.json({ error: "Journal entry not found or access denied" }, { status: 404 });
    }

    // 4. Determine Temp Path & MIME Type
    const audioUrl = log.audio_url;
    let mimeType = "audio/wav"; // default fallback
    
    // Parse file path from the audio URL
    const urlObj = new URL(audioUrl);
    const pathParts = urlObj.pathname.split("/audio_journals/");
    const filePath = pathParts.length >= 2 ? decodeURIComponent(pathParts[1]) : "file.wav";
    const extension = filePath.split(".").pop()?.toLowerCase() || "wav";

    if (extension === "webm") {
      mimeType = "audio/webm";
    } else if (extension === "mp3") {
      mimeType = "audio/mp3";
    } else if (extension === "m4a" || extension === "aac") {
      mimeType = "audio/aac";
    } else if (extension === "ogg") {
      mimeType = "audio/ogg";
    }

    tempFilePath = path.join(os.tmpdir(), `temp-${logId}.${extension}`);

    // 5. Download Audio File from Supabase Storage as a stream to disk (prevents Memory OOM)
    try {
      const headers: HeadersInit = {};
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (serviceKey) {
        headers["apikey"] = serviceKey;
        headers["Authorization"] = `Bearer ${serviceKey}`;
      } else if (anonKey) {
        headers["apikey"] = anonKey;
        headers["Authorization"] = `Bearer ${anonKey}`;
      }

      let fileResponse = await fetch(audioUrl);
      if (!fileResponse.ok && audioUrl.includes("supabase")) {
        const authenticatedUrl = audioUrl.replace("/object/public/", "/object/authenticated/");
        fileResponse = await fetch(authenticatedUrl, { headers });
      }
      if (!fileResponse.ok) {
        throw new Error(`Audio URL download returned status ${fileResponse.status}`);
      }
      
      const contentType = fileResponse.headers.get("content-type");
      if (contentType) mimeType = contentType;

      const bodyStream = fileResponse.body;
      if (!bodyStream) {
        throw new Error("HTTP response body is empty");
      }

      // Stream the response body directly to a temp file on disk
      const fileWriter = fs.createWriteStream(tempFilePath);
      await finished(Readable.fromWeb(bodyStream as any).pipe(fileWriter));
    } catch (downloadErr: any) {
      console.error("Streaming download failure:", downloadErr);
      return NextResponse.json({ error: `Failed to download audio file: ${downloadErr.message}` }, { status: 500 });
    }

    // 5.5 Fetch User's Knowledge Base if it exists to pass as background prompt context
    let kbContext = "";
    try {
      const { data: kbData } = await adminSupabase
        .from("journal_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("processing_status", "knowledge_base")
        .maybeSingle();

      if (kbData) {
        const parsed = JSON.parse(kbData.raw_transcript);
        kbContext = `Knowledge Base Facts:\n${parsed.facts?.join("\n") || ""}\n\n` +
          `Strengths:\n${parsed.strengths?.join("\n") || ""}\n\n` +
          `Weaknesses:\n${parsed.weaknesses?.join("\n") || ""}\n\n` +
          `Relations:\n${JSON.stringify(parsed.relations || "")}\n\n` +
          `Locations:\n${JSON.stringify(parsed.locations || "")}\n\n` +
          `Scenarios:\n${JSON.stringify(parsed.scenarios || "")}\n\n` +
          `Growth:\n${parsed.growth?.join("\n") || ""}`;
        console.log(`[process-audio] Loaded Knowledge Base context (${kbContext.length} chars) for user ${user.id}`);
      }
    } catch (kbErr) {
      console.error("[process-audio] Failed to load user knowledge base for context:", kbErr);
    }

    // 6. Send Audio to AI Engine for Processing using local file path
    const aiResult = await activeEngine.processAudioFilePath(tempFilePath, mimeType, {
      removeFillerWords: removeFillerWords ?? true,
      enableSwearWords: enableSwearWords ?? false,
      customPrompt: customPrompt ?? "",
      language,
      customMoods,
      categories,
      tags,
      knowledgeBaseContext: kbContext,
    });

    // 7. Extract existing custom tags to preserve them, but replace/add the category tag
    const currentCustomTags = log.custom_tags || [];
    const filteredCustomTags = currentCustomTags.filter((t: string) => !t.startsWith("_category:"));
    const newCategoryTag = `_category:${aiResult.ai_category || "General"}`;
    const updatedCustomTags = [...filteredCustomTags, newCategoryTag];

    // 8. Update the Database Record with AI Output (using admin client to prevent RLS update restrictions)
    const { data: updatedLog, error: updateError } = await adminSupabase
      .from("journal_logs")
      .update({
        ai_title: aiResult.ai_title,
        ai_mood_color: aiResult.ai_mood_color,
        raw_transcript: aiResult.raw_transcript,
        tidied_log: aiResult.tidied_log,
        ai_tags: aiResult.ai_tags,
        custom_tags: updatedCustomTags,
        processing_status: "completed",
      })
      .eq("id", logId)
      .select()
      .single();

    if (updateError) {
      console.error("DB update error:", updateError);
      return NextResponse.json({ error: `Failed to update log: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json(updatedLog, { status: 200 });

  } catch (err: any) {
    console.error("Audio processing API error:", err);
    
    // Attempt to mark log as failed in DB if logId was provided
    try {
      const bodyText = await request.clone().text().catch(() => null);
      if (bodyText) {
        const bodyParsed = JSON.parse(bodyText);
        if (bodyParsed.logId) {
          const adminSupabase = createAdminClient();
          await adminSupabase
            .from("journal_logs")
            .update({ processing_status: "failed" })
            .eq("id", bodyParsed.logId);
        }
      }
    } catch (e) {
      console.warn("Failed to set processing_status to failed:", e);
    }

    return NextResponse.json({ error: `Internal Server Error: ${err.message || err}` }, { status: 500 });
  } finally {
    // 8. Clean up local temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await fs.promises.unlink(tempFilePath).catch((unlinkErr) => {
        console.error("Failed to delete temp file:", unlinkErr);
      });
    }
  }
}
