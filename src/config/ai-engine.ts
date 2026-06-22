import Groq from "groq-sdk";
import OpenAI from "openai";
import * as fs from "fs";

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
    try {
      const whisperOptions: any = {
        file: fs.createReadStream(filePath),
        model: "whisper-large-v3",
        response_format: "json",
      };
      if (langOption && langOption !== "auto" && langOption !== "multidetect") {
        whisperOptions.language = langOption;
      }
      const transcription = await this.groqClient.audio.transcriptions.create(whisperOptions);
      rawTranscript = transcription.text;
    } catch (err: any) {
      console.error("Groq Whisper transcription failed:", err);
      throw new Error(`Groq transcription failed: ${err.message || err}`);
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
        console.log("Attempting semantic analysis using Hack Club AI...");
        const response = await this.openaiClient.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Here is the raw transcript to analyze:\n\n${rawTranscript}` },
          ],
        });
        responseText = response.choices[0]?.message?.content || null;
      } catch (err: any) {
        console.error("Hack Club AI analysis failed, falling back to Groq Llama:", err);
        usedGroqFallback = true;
      }
    } else {
      console.log("HACK_CLUB_API_KEY is not configured. Falling back to Groq Llama directly.");
      usedGroqFallback = true;
    }

    if (usedGroqFallback || !responseText) {
      try {
        console.log("Performing semantic analysis using Groq Llama fallback (llama-3.3-70b-versatile)...");
        const response = await this.groqClient.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Here is the raw transcript to analyze:\n\n${rawTranscript}` },
          ],
        });
        responseText = response.choices[0]?.message?.content || null;
      } catch (err: any) {
        console.error("Groq Llama fallback failed:", err);
        throw new Error(`AI analysis failed (both Hack Club and Groq Llama fallback failed): ${err.message || err}`);
      }
    }

    if (!responseText) {
      throw new Error("No response text returned from AI completion");
    }

    try {
      const parsed = JSON.parse(responseText);

      return {
        ai_title: parsed.ai_title || "Voice Journal Entry",
        ai_mood_color: parsed.ai_mood_color || "#74c7ec",
        raw_transcript: rawTranscript,
        tidied_log: parsed.tidied_log || rawTranscript,
        ai_tags: parsed.ai_tags || ["Journal"],
        ai_category: parsed.ai_category || "General",
      };
    } catch (parseErr: any) {
      console.error("Failed to parse JSON response from LLM:", responseText);
      throw new Error(`JSON parsing of AI analysis failed: ${parseErr.message}`);
    }
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
