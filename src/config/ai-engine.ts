import Groq from "groq-sdk";
import OpenAI from "openai";
import * as fs from "fs";
import { execSync } from "child_process";
import * as path from "path";

export interface JournalAnalysisResult {
  ai_title: string;
  ai_mood_color: string;
  raw_transcript: string;
  tidied_log: string;
  ai_tags: string[];
  ai_category: string;
}

export interface AIEngine {
  processAudioFilePath(
    filePath: string,
    mimeType: string,
    options?: {
      removeFillerWords?: boolean;
      enableSwearWords?: boolean;
      customPrompt?: string;
      language?: string;
      customMoods?: { name: string; color: string }[];
      categories?: { mode: 'open' | 'flexible' | 'strict'; list: string[] };
      tags?: { mode: 'open' | 'flexible' | 'strict'; list: string[] };
      knowledgeBaseContext?: string;
    }
  ): Promise<JournalAnalysisResult>;
}

export class GroqHackClubEngine implements AIEngine {
  private groqClient: Groq;
  private openaiClient: OpenAI;

  constructor() {
    const groqKey = process.env.GROQ_API_KEY || "";
    const hackClubKey = process.env.HACK_CLUB_API_KEY || "";

    this.groqClient = new Groq({ apiKey: groqKey });
    this.openaiClient = new OpenAI({
      apiKey: hackClubKey,
      baseURL: "https://ai.hackclub.com/proxy/v1",
    });
  }

  private isCommandAvailable(cmd: string): boolean {
    try {
      execSync(`${cmd} -version`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  private splitWavFile(filePath: string, maxChunkSizeInBytes: number): string[] {
    const fileBuffer = fs.readFileSync(filePath);
    
    // Verify RIFF WAVE header
    if (fileBuffer.toString("ascii", 0, 4) !== "RIFF" || fileBuffer.toString("ascii", 8, 12) !== "WAVE") {
      throw new Error("Input file is not a valid RIFF WAVE file.");
    }
    
    const numChannels = fileBuffer.readUInt16LE(22);
    const sampleRate = fileBuffer.readUInt32LE(24);
    const bitsPerSample = fileBuffer.readUInt16LE(34);
    const blockAlign = fileBuffer.readUInt16LE(32);

    if (!numChannels || !sampleRate || !bitsPerSample || !blockAlign) {
      throw new Error("Invalid WAV format parameters read from header.");
    }
    
    let dataOffset = 44; // Default fallback
    try {
      let tempOffset = 12;
      while (tempOffset < fileBuffer.length - 8) {
        const chunkId = fileBuffer.toString("ascii", tempOffset, tempOffset + 4);
        const chunkSize = fileBuffer.readUInt32LE(tempOffset + 4);
        if (chunkId === "data") {
          dataOffset = tempOffset + 8;
          break;
        }
        tempOffset += 8 + chunkSize;
      }
    } catch (err) {
      console.warn("Failed to dynamically find WAV data chunk offset, defaulting to 44:", err);
    }
    
    const rawPcmData = fileBuffer.subarray(dataOffset);
    const totalPcmBytes = rawPcmData.length;
    
    const chunks: string[] = [];
    const tempDir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    
    let currentOffset = 0;
    let chunkIdx = 0;
    
    while (currentOffset < totalPcmBytes) {
      let chunkSize = maxChunkSizeInBytes;
      if (currentOffset + chunkSize > totalPcmBytes) {
        chunkSize = totalPcmBytes - currentOffset;
      } else {
        // Align to block boundaries (samples)
        chunkSize = Math.floor(chunkSize / blockAlign) * blockAlign;
      }
      
      const chunkPcm = rawPcmData.subarray(currentOffset, currentOffset + chunkSize);
      currentOffset += chunkSize;
      
      // Construct new WAV header
      const headerBuffer = Buffer.alloc(44);
      headerBuffer.write("RIFF", 0, "ascii");
      headerBuffer.writeUInt32LE(36 + chunkPcm.length, 4);
      headerBuffer.write("WAVE", 8, "ascii");
      
      headerBuffer.write("fmt ", 12, "ascii");
      headerBuffer.writeUInt32LE(16, 16);
      headerBuffer.writeUInt16LE(1, 20); // PCM
      headerBuffer.writeUInt16LE(numChannels, 22);
      headerBuffer.writeUInt32LE(sampleRate, 24);
      headerBuffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
      headerBuffer.writeUInt16LE(blockAlign, 32);
      headerBuffer.writeUInt16LE(bitsPerSample, 34);
      
      headerBuffer.write("data", 36, "ascii");
      headerBuffer.writeUInt32LE(chunkPcm.length, 40);
      
      const chunkFile = path.join(tempDir, `${baseName}-part-${String(chunkIdx).padStart(3, "0")}.wav`);
      fs.writeFileSync(chunkFile, Buffer.concat([headerBuffer, chunkPcm]));
      chunks.push(chunkFile);
      chunkIdx++;
    }
    
    return chunks;
  }

  private splitMp3File(filePath: string, maxChunkSizeInBytes: number): string[] {
    console.log(`[AI Engine] [Vercel Logger] [MP3 Splitter] Loading file ${filePath} into memory for segmentation...`);
    const fileBuffer = fs.readFileSync(filePath);
    const totalBytes = fileBuffer.length;
    const chunks: string[] = [];
    const tempDir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    
    let currentOffset = 0;
    let chunkIdx = 0;
    
    while (currentOffset < totalBytes) {
      let targetEnd = currentOffset + maxChunkSizeInBytes;
      if (targetEnd >= totalBytes) {
        targetEnd = totalBytes;
      } else {
        // Search for the next MP3 frame sync word to split cleanly.
        // Sync word: byte1 = 0xFF, byte2 high 3 bits set (i.e. (byte2 & 0xE0) === 0xE0)
        let foundSync = false;
        // Search forward up to 16KB for a sync word to avoid splitting in the middle of a frame.
        for (let i = targetEnd; i < Math.min(targetEnd + 16384, totalBytes - 1); i++) {
          if (fileBuffer[i] === 0xFF && (fileBuffer[i + 1] & 0xE0) === 0xE0) {
            targetEnd = i;
            foundSync = true;
            break;
          }
        }
        // If not found in the forward search, search backward up to 16KB
        if (!foundSync) {
          for (let i = targetEnd; i > Math.max(currentOffset, targetEnd - 16384); i--) {
            if (fileBuffer[i] === 0xFF && (fileBuffer[i + 1] & 0xE0) === 0xE0) {
              targetEnd = i;
              foundSync = true;
              break;
            }
          }
        }
      }
      
      const chunkData = fileBuffer.subarray(currentOffset, targetEnd);
      currentOffset = targetEnd;
      
      const chunkFile = path.join(tempDir, `${baseName}-part-${String(chunkIdx).padStart(3, "0")}.mp3`);
      fs.writeFileSync(chunkFile, chunkData);
      console.log(`[AI Engine] [Vercel Logger] [MP3 Splitter] Written chunk ${chunkIdx}: ${chunkFile} (size: ${(chunkData.length / 1024 / 1024).toFixed(2)} MB)`);
      chunks.push(chunkFile);
      chunkIdx++;
    }
    
    return chunks;
  }

  private async transcribeSingleFile(filePath: string, langOption: string): Promise<string> {
    const whisperOptions: any = {
      file: fs.createReadStream(filePath),
      model: "whisper-large-v3",
      response_format: "json",
    };
    if (langOption && langOption !== "auto" && langOption !== "multidetect") {
      whisperOptions.language = langOption;
    }
    const transcription = await this.groqClient.audio.transcriptions.create(whisperOptions);
    return transcription.text || "";
  }

  async processAudioFilePath(
    filePath: string,
    mimeType: string,
    options?: {
      removeFillerWords?: boolean;
      enableSwearWords?: boolean;
      customPrompt?: string;
      language?: string;
      customMoods?: { name: string; color: string }[];
      categories?: { mode: 'open' | 'flexible' | 'strict'; list: string[] };
      tags?: { mode: 'open' | 'flexible' | 'strict'; list: string[] };
      knowledgeBaseContext?: string;
    }
  ): Promise<JournalAnalysisResult> {
    const groqApiKey = process.env.GROQ_API_KEY;
    const hasGroq = groqApiKey && groqApiKey !== "your-groq-api-key-here";

    if (!hasGroq) {
      console.warn("GROQ_API_KEY is not configured! Cannot transcribe. Using mockup response.");
      return this.getMockupResponse();
    }

    const removeFiller = options?.removeFillerWords ?? true;
    const enableSwear = options?.enableSwearWords ?? false;
    const customPrompt = options?.customPrompt || "";
    const langOption = options?.language || "auto";
    const customMoods = options?.customMoods || [
      { name: "Stressed", color: "#f38ba8" },
      { name: "Calm", color: "#74c7ec" },
      { name: "Focused", color: "#a6e3a1" },
      { name: "Excited", color: "#cba6f7" },
      { name: "Sad", color: "#89b4fa" },
      { name: "Tired", color: "#fab387" }
    ];
    const categoriesConfig = options?.categories || { mode: 'open', list: [] };
    const tagsConfig = options?.tags || { mode: 'open', list: [] };

    // 1. Transcribe the audio file using Groq Whisper API
    let rawTranscript = "";
    const stats = fs.statSync(filePath);
    const fileSizeInBytes = stats.size;
    const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24 MB
    const chunkFilesToDelete: string[] = [];

    try {
      console.log(`[AI Engine] [Vercel Logger] Processing file: ${filePath} (Size: ${(fileSizeInBytes / 1024 / 1024).toFixed(2)} MB, MIME: ${mimeType})`);
      if (fileSizeInBytes <= MAX_CHUNK_SIZE) {
        console.log(`[AI Engine] [Vercel Logger] File size is within 24MB limit. Transcribing directly...`);
        const startTime = Date.now();
        rawTranscript = await this.transcribeSingleFile(filePath, langOption);
        console.log(`[AI Engine] [Vercel Logger] Transcribed single file successfully in ${Date.now() - startTime}ms. Transcript length: ${rawTranscript.length} chars.`);
      } else {
        console.log(`[AI Engine] [Vercel Logger] File size exceeds 24MB limit. Initiating splitting flow...`);
        
        // Read file header to see if it is a WAV or MP3 file
        let isWav = false;
        let isMp3 = false;
        try {
          const fd = fs.openSync(filePath, "r");
          const headerBuf = Buffer.alloc(12);
          fs.readSync(fd, headerBuf, 0, 12, 0);
          fs.closeSync(fd);
          
          isWav = headerBuf.toString("ascii", 0, 4) === "RIFF" && headerBuf.toString("ascii", 8, 12) === "WAVE";
          
          isMp3 = (headerBuf[0] === 0x49 && headerBuf[1] === 0x44 && headerBuf[2] === 0x33) || // ID3
                  (headerBuf[0] === 0xFF && (headerBuf[1] & 0xE0) === 0xE0) ||                 // MP3 frame sync
                  filePath.toLowerCase().endsWith(".mp3");
          
          console.log(`[AI Engine] [Vercel Logger] File header analysis: isWav = ${isWav}, isMp3 = ${isMp3}`);
        } catch (err) {
          console.warn("[AI Engine] [Vercel Logger] Could not read file header to check format:", err);
        }

        const hasFfmpeg = this.isCommandAvailable("ffmpeg");
        const hasFfprobe = this.isCommandAvailable("ffprobe");
        console.log(`[AI Engine] [Vercel Logger] System commands status: hasFfmpeg = ${hasFfmpeg}, hasFfprobe = ${hasFfprobe}`);

        let chunkFiles: string[] = [];

        if (isWav) {
          console.log("[AI Engine] [Vercel Logger] Selected splitting method: Pure JS WAV Splitter.");
          chunkFiles = this.splitWavFile(filePath, MAX_CHUNK_SIZE);
        } else if (isMp3) {
          console.log("[AI Engine] [Vercel Logger] Selected splitting method: Pure JS MP3 Frame Splitter.");
          chunkFiles = this.splitMp3File(filePath, MAX_CHUNK_SIZE);
        } else if (hasFfmpeg && hasFfprobe) {
          console.log("[AI Engine] [Vercel Logger] Selected splitting method: System ffmpeg/ffprobe CLI.");
          let duration = 0;
          try {
            const output = execSync(
              `ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`,
              { encoding: "utf8" }
            );
            duration = parseFloat(output.trim());
          } catch (err) {
            console.error("[AI Engine] [Vercel Logger] Failed to read duration with ffprobe:", err);
          }

          const numChunks = Math.ceil(fileSizeInBytes / MAX_CHUNK_SIZE);
          let segmentTime = 300; // default 5 minutes
          if (duration > 0) {
            segmentTime = Math.floor(duration / numChunks);
            if (segmentTime < 10) segmentTime = 10;
          }

          const tempDir = path.dirname(filePath);
          const ext = path.extname(filePath);
          const baseName = path.basename(filePath, ext);
          const outputPattern = path.join(tempDir, `${baseName}-part-%03d${ext}`);

          const ffmpegCmd = `ffmpeg -y -i "${filePath}" -f segment -segment_time ${segmentTime} -c copy "${outputPattern}"`;
          console.log(`[AI Engine] [Vercel Logger] Executing audio split: ${ffmpegCmd}`);
          execSync(ffmpegCmd, { stdio: "ignore" });

          const filesInTemp = fs.readdirSync(tempDir);
          chunkFiles = filesInTemp
            .filter(f => f.startsWith(`${baseName}-part-`) && f.endsWith(ext))
            .sort()
            .map(f => path.join(tempDir, f));
        } else {
          throw new Error(
            `File size (${(fileSizeInBytes / 1024 / 1024).toFixed(1)}MB) exceeds 25MB limit, ` +
            `and ffmpeg/ffprobe are not installed on Vercel to split this non-WAV/non-MP3 file. ` +
            `Please upload a WAV or MP3 file, or configure ffmpeg binaries on the host.`
          );
        }

        chunkFilesToDelete.push(...chunkFiles);

        if (chunkFiles.length === 0) {
          throw new Error("Splitting completed but did not produce any chunk files.");
        }

        console.log(`[AI Engine] [Vercel Logger] Audio split completed successfully. Generated ${chunkFiles.length} chunks. Transcribing chunks...`);
        const transcripts: string[] = [];
        for (let idx = 0; idx < chunkFiles.length; idx++) {
          const chunkPath = chunkFiles[idx];
          const chunkSize = fs.statSync(chunkPath).size;
          console.log(`[AI Engine] [Vercel Logger] Starting transcription of chunk ${idx + 1}/${chunkFiles.length}: ${chunkPath} (Size: ${(chunkSize / 1024 / 1024).toFixed(2)} MB)`);
          const chunkStart = Date.now();
          const text = await this.transcribeSingleFile(chunkPath, langOption);
          console.log(`[AI Engine] [Vercel Logger] Chunk ${idx + 1}/${chunkFiles.length} transcription finished in ${Date.now() - chunkStart}ms. Length: ${text.length} chars.`);
          if (text && text.trim().length > 0) {
            transcripts.push(text.trim());
          }
        }
        rawTranscript = transcripts.join(" ");
        console.log(`[AI Engine] [Vercel Logger] All chunks transcribed successfully. Merged transcript length: ${rawTranscript.length} chars.`);
      }
    } catch (err: any) {
      console.error("Groq Whisper transcription failed:", err);
      throw new Error(`Groq transcription failed: ${err.message || err}`);
    } finally {
      for (const chunkPath of chunkFilesToDelete) {
        if (fs.existsSync(chunkPath)) {
          try {
            fs.unlinkSync(chunkPath);
          } catch (unlinkErr) {
            console.error(`Failed to delete chunk file: ${chunkPath}`, unlinkErr);
          }
        }
      }
    }

    if (!rawTranscript || rawTranscript.trim().length === 0) {
      throw new Error("Groq transcription returned empty text.");
    }

    const categoriesInstruction = (() => {
      const listStr = categoriesConfig.list.map(c => `"${c}"`).join(", ");
      if (categoriesConfig.mode === 'strict') {
        return `You MUST classify the entry into EXACTLY ONE category from this allowed list: [${listStr}]. Do not generate any new categories under any circumstances.`;
      }
      if (categoriesConfig.mode === 'flexible') {
        return `Try to classify the entry into EXACTLY ONE category from this list: [${listStr}] if one fits. If none of these fit the contents, you may generate a new appropriate category (1-2 words).`;
      }
      return `Classify the entry into EXACTLY ONE broad category (e.g. "School", "Work", "Personal", "Health", "Social"). You can generate any category that represents the broad context of the thoughts.`;
    })();

    const tagsInstruction = (() => {
      const listStr = tagsConfig.list.map(t => `"${t}"`).join(", ");
      if (tagsConfig.mode === 'strict') {
        return `You MUST select tags ONLY from this allowed list: [${listStr}]. Do not output any tags that are not in this list. Extract 2 to 5 matching tags.`;
      }
      if (tagsConfig.mode === 'flexible') {
        return `Select tags preferably from this list: [${listStr}]. If the text contains specific themes not covered by this list, you may generate new specific tags. Extract 2 to 5 tags in total.`;
      }
      return `Extract 2 to 5 relevant conceptual tags. Be specific (e.g., "coding troubles", "exam stress", "childhood memories").`;
    })();

    // 2. Perform semantic and mood analysis
    const systemPrompt = `
      You are an empathetic, silent listening journal assistant.
      You are provided with a raw transcript of the user's audio journal entry.
      Analyze the text to assess emotional tone, clean up grammar/syntax, format it, and extract details.

      ${options?.knowledgeBaseContext ? `BACKGROUND KNOWLEDGE BASE CONTEXT:
      Use the following compiled facts, history, strengths, weaknesses, relations, and scenario patterns to contextualize this current entry (understand recurring patterns, people, or preferences):
      ${options.knowledgeBaseContext}
      ` : ""}

      LANGUAGE DIRECTION:
      Output ALL fields ("ai_title", "ai_category", "ai_tags", "tidied_log") in the same language as detected in the raw transcript. If the transcript is in Spanish, output all fields in Spanish. If in Portuguese, output in Portuguese.

      FORMATTING DIRECTIONS:
      ${customPrompt ? `Apply the following custom user prompt instructions to shape the tone, formatting, and layout of the tidied journal:
      "${customPrompt}"` : `Format the "tidied_log" strictly like a beautiful journal entry.
      - Group thoughts into logical paragraphs with double line breaks for spacing.
      - Retain any dates, times, and specific details mentioned.
      - Fix grammar, spelling, punctuation, and structural flow.
      - You may use standard Markdown (like headers, bold text, lists, and horizontal lines) to format the thoughts beautifully.
      - DO NOT SUMMARIZE or shorten the thoughts; keep the full length and depth of the user's message.`}

      CRITICAL TRANSCRIPTION RULES:
      - Filler words (e.g., 'um', 'uh', 'like', 'you know'): ${removeFiller ? "Filter out and remove them entirely." : "Retain filler words but clean up spelling/punctuation."}
      - Swear/Curse words: ${enableSwear ? "Strictly RETAIN all swear and curse words, as they express the user's raw emotion." : "Filter or clean up severe swear/curse words if present."}

      CATEGORY CLASSIFICATION RULE:
      ${categoriesInstruction}

      TAG CLASSIFICATION RULE:
      ${tagsInstruction}

      You MUST respond ONLY with a JSON object matching this structure:
      {
        "ai_title": "A short, beautiful title (3-6 words) summarizing the entry.",
        "ai_mood_color": "Assign one of the following exact hex codes representing their emotional tone based on semantics:
${customMoods.map(m => `                          - ${m.name} -> '${m.color}'`).join('\n')}",
        "ai_category": "The single broad category class name.",
        "ai_tags": ["2 to 5 relevant conceptual tags."],
        "tidied_log": "The tidied, formatted journal text based on the directions above."
      }

      Do not include any markup other than valid JSON. Ensure JSON compliance.
    `;

    let responseText: string | null = null;
    let usedGroqFallback = false;

    const hackClubApiKey = process.env.HACK_CLUB_API_KEY;
    const hasHackClub = hackClubApiKey && hackClubApiKey !== "your-hack-club-api-key-here";

    if (hasHackClub) {
      try {
        console.log("[AI Engine] [Vercel Logger] Attempting semantic analysis using Hack Club AI (gpt-4o-mini)...");
        const llmStart = Date.now();
        const response = await this.openaiClient.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Here is the raw transcript to analyze:\n\n${rawTranscript}` },
          ],
        });
        responseText = response.choices[0]?.message?.content || null;
        console.log(`[AI Engine] [Vercel Logger] Hack Club AI completion finished successfully in ${Date.now() - llmStart}ms.`);
      } catch (err: any) {
        console.error("[AI Engine] [Vercel Logger] Hack Club AI analysis failed, falling back to Groq Llama:", err);
        usedGroqFallback = true;
      }
    } else {
      console.log("[AI Engine] [Vercel Logger] HACK_CLUB_API_KEY is not configured. Falling back to Groq Llama directly.");
      usedGroqFallback = true;
    }

    if (usedGroqFallback || !responseText) {
      try {
        console.log("[AI Engine] [Vercel Logger] Performing semantic analysis using Groq Llama fallback (llama-3.3-70b-versatile)...");
        const llmStart = Date.now();
        const response = await this.groqClient.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Here is the raw transcript to analyze:\n\n${rawTranscript}` },
          ],
        });
        responseText = response.choices[0]?.message?.content || null;
        console.log(`[AI Engine] [Vercel Logger] Groq Llama completion finished successfully in ${Date.now() - llmStart}ms.`);
      } catch (err: any) {
        console.error("[AI Engine] [Vercel Logger] Groq Llama fallback failed:", err);
      }
    }

    if (!responseText) {
      console.log("[AI Engine] [Vercel Logger] Hack Club AI and Groq failed. Attempting OpenRouter free models fallback...");
      responseText = await this.tryOpenRouterFallback(
        systemPrompt,
        `Here is the raw transcript to analyze:\n\n${rawTranscript}`
      );
    }

    if (!responseText) {
      throw new Error("No response text returned from AI completion after trying Hack Club AI, Groq Llama, and OpenRouter free models.");
    }

    try {
      const cleanedJsonText = this.cleanJsonText(responseText);
      const parsed = JSON.parse(cleanedJsonText);
      
      const result = {
        ai_title: parsed.ai_title || "Voice Journal Entry",
        ai_mood_color: parsed.ai_mood_color || "#74c7ec",
        raw_transcript: rawTranscript,
        tidied_log: parsed.tidied_log || rawTranscript,
        ai_tags: parsed.ai_tags || ["Journal"],
        ai_category: parsed.ai_category || "General",
      };

      console.log(`[AI Engine] [Vercel Logger] Parsing success. Title: "${result.ai_title}", Mood Color: "${result.ai_mood_color}", Category: "${result.ai_category}", Tags: [${result.ai_tags.join(", ")}]`);
      return result;
    } catch (parseErr: any) {
      console.error("[AI Engine] [Vercel Logger] Failed to parse JSON response from LLM:", responseText);
      throw new Error(`JSON parsing of AI analysis failed: ${parseErr.message}`);
    }
  }

  private cleanJsonText(text: string): string {
    const trimmed = text.trim();
    // Strip markdown code block wrappers if present
    const stripped = trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : stripped;
  }

  private async tryOpenRouterFallback(systemPrompt: string, userContent: string): Promise<string | null> {
    const openrouterApiKey = process.env.OPENROUTER_API_KEY || process.env.HACK_CLUB_API_KEY || "";
    
    // List of top reliable free models on OpenRouter
    const freeModels = [
      "google/gemini-2.0-flash-lite-preview-02-05:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "deepseek/deepseek-r1:free",
      "qwen/qwen-2.5-coder-32b-instruct:free",
      "mistralai/mistral-7b-instruct:free",
    ];

    const openRouterClient = new OpenAI({
      apiKey: openrouterApiKey || "free-access",
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://yapsite.app",
        "X-Title": "YapSite Journal",
      },
    });

    for (const model of freeModels) {
      try {
        console.log(`[AI Engine] [OpenRouter Fallback] Trying free model: ${model}...`);
        const startTime = Date.now();
        
        // First try with json_object format
        let response;
        try {
          response = await openRouterClient.chat.completions.create({
            model,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
          });
        } catch (formatErr) {
          // Some OpenRouter free models do not support response_format json_object, try standard text completion
          console.warn(`[AI Engine] [OpenRouter Fallback] Model ${model} failed with json_object format, retrying without response_format...`);
          response = await openRouterClient.chat.completions.create({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
          });
        }

        const text = response.choices[0]?.message?.content;
        if (text && text.trim().length > 0) {
          console.log(`[AI Engine] [OpenRouter Fallback] ${model} completed successfully in ${Date.now() - startTime}ms.`);
          return text;
        }
      } catch (modelErr: any) {
        console.warn(`[AI Engine] [OpenRouter Fallback] ${model} failed:`, modelErr?.message || modelErr);
      }
    }

    return null;
  }

  private getMockupResponse(): JournalAnalysisResult {
    return {
      ai_title: "Mock Journal Entry (API Keys Missing)",
      ai_mood_color: "#74c7ec",
      raw_transcript: "This is a fallback transcript because the GROQ_API_KEY or HACK_CLUB_API_KEY was not configured in environment variables. Please provide them in your .env file to activate voice analysis.",
      tidied_log: "This is a fallback transcript because the GROQ_API_KEY or HACK_CLUB_API_KEY was not configured in environment variables. Please provide them in your .env file to activate voice analysis.",
      ai_tags: ["Fallback", "Configuration", "Welcome"],
      ai_category: "System",
    };
  }
}

export const activeEngine: AIEngine = new GroqHackClubEngine();
