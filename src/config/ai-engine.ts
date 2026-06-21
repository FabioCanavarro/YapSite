import Groq from "groq-sdk";
import OpenAI from "openai";
import * as fs from "fs";

export interface JournalAnalysisResult {
  ai_title: string;
  ai_mood_color: string;
  raw_transcript: string;
  tidied_log: string;
  ai_tags: string[];
}

export interface AIEngine {
  processAudioFilePath(
    filePath: string,
    mimeType: string,
    options?: { removeFillerWords?: boolean }
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
    options?: { removeFillerWords?: boolean }
  ): Promise<JournalAnalysisResult> {
    const groqApiKey = process.env.GROQ_API_KEY;
    const hasGroq = groqApiKey && groqApiKey !== "your-groq-api-key-here";

    if (!hasGroq) {
      console.warn("GROQ_API_KEY is not configured! Cannot transcribe. Using mockup response.");
      return this.getMockupResponse();
    }

    const removeFiller = options?.removeFillerWords ?? true;

    // 1. Transcribe the audio file using Groq Whisper API
    let rawTranscript = "";
    try {
      const transcription = await this.groqClient.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-large-v3",
        response_format: "json",
        language: "en", // Force English to prevent Whisper from translating or switching languages
      });
      rawTranscript = transcription.text;
    } catch (err: any) {
      console.error("Groq Whisper transcription failed:", err);
      throw new Error(`Groq transcription failed: ${err.message || err}`);
    }

    if (!rawTranscript || rawTranscript.trim().length === 0) {
      throw new Error("Groq transcription returned empty text.");
    }

    // 2. Perform semantic and mood analysis
    const systemPrompt = `
      You are an empathetic, silent listening journal assistant.
      You are provided with a raw transcript of the user's audio journal entry.
      Analyze the text to assess emotional tone, clean up punctuation/grammar/syntax, and extract details.

      You MUST respond ONLY with a JSON object matching this structure:
      {
        "ai_title": "A short, beautiful title (3-6 words) summarizing the entry.",
        "ai_mood_color": "Assign one of the following exact hex codes representing their emotional tone based on semantics:
                          - Stressed / Angry / Ranting -> '#f38ba8'
                          - Calm / Sad / Deep Reflection -> '#74c7ec'
                          - Productive / Focused -> '#a6e3a1'
                          - Hype / Happy / Excited -> '#cba6f7'",
        "tidied_log": "Strictly copy the user's thoughts. Fix grammar, spelling, punctuation, and formatting, but DO NOT SUMMARIZE OR SHORTEN. Keep full fidelity and length of the thoughts.
                       - If removeFillerWords is true, filter out filler words (e.g., 'um', 'uh', 'like', 'you know').
                       - If removeFillerWords is false, retain the filler words but clean up spelling/punctuation.
                       Current setting: removeFillerWords is ${removeFiller ? "TRUE" : "FALSE"}.",
        "ai_tags": ["2 to 5 relevant conceptual tags."]
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
    };
  }
}

export const activeEngine: AIEngine = new GroqHackClubEngine();
