import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";
import OpenAI from "openai";

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized: Please log in" }, { status: 401 });
    }

    // 2. Parse payload
    const body = await request.json();
    const {
      journalId,
      messages,
      journalTitle,
      journalText,
      reflections,
      provider = "hackclub",
      apiKey = "",
      model = "",
    } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Missing messages array" }, { status: 400 });
    }

    const journalContext = `
      CURRENT JOURNAL ENTRY CONTEXT:
      Title: "${journalTitle || "Journal Entry"}"
      Tidied Thoughts: "${journalText || ""}"
      ${reflections ? `AI Reflections: "${reflections}"` : ""}
    `;

    const systemPrompt = `
      You are an empathetic, insightful AI Journal Companion conversing with the user about their specific journal entry.
      ${journalContext}

      GUIDELINES:
      - Be warm, supportive, and conversational.
      - Directly reference details from the journal entry when helpful.
      - Offer constructive perspectives, gentle questions, or creative ideas.
      - Keep responses concise and engaging (2-4 paragraphs max).
    `;

    // 3. Resolve API provider and key
    let finalApiKey = apiKey;
    let finalModel = model;
    let finalProvider = provider;

    if (finalProvider === "hackclub") {
      if (!finalApiKey) finalApiKey = process.env.HACK_CLUB_API_KEY || "";
      if (!finalModel) finalModel = "gpt-4o-mini";
    } else if (finalProvider === "groq") {
      if (!finalApiKey) finalApiKey = process.env.GROQ_API_KEY || "";
      if (!finalModel) finalModel = "llama-3.3-70b-versatile";
    } else if (finalProvider === "custom_openai") {
      if (!finalApiKey) finalApiKey = process.env.OPENAI_API_KEY || "";
      if (!finalModel) finalModel = "gpt-4o-mini";
    }

    if (!finalApiKey) {
      return NextResponse.json({
        error: `API Key missing for provider '${finalProvider}'. Please add it in Settings.`
      }, { status: 400 });
    }

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    ];

    let responseText = "";

    if (finalProvider === "hackclub") {
      const client = new OpenAI({
        apiKey: finalApiKey,
        baseURL: "https://ai.hackclub.com/proxy/v1",
      });
      const response = await client.chat.completions.create({
        model: finalModel,
        messages: fullMessages as any,
      });
      responseText = response.choices[0]?.message?.content || "";
    } else if (finalProvider === "custom_openai") {
      const client = new OpenAI({ apiKey: finalApiKey });
      const response = await client.chat.completions.create({
        model: finalModel,
        messages: fullMessages as any,
      });
      responseText = response.choices[0]?.message?.content || "";
    } else if (finalProvider === "groq") {
      const client = new Groq({ apiKey: finalApiKey });
      const groqModels = Array.from(new Set([
        finalModel,
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "llama3-70b-8192",
        "mixtral-8x7b-32768",
      ])).filter(Boolean);

      for (const modelCandidate of groqModels) {
        try {
          const response = await client.chat.completions.create({
            model: modelCandidate,
            messages: fullMessages as any,
          });
          responseText = response.choices[0]?.message?.content || "";
          if (responseText) break;
        } catch (err: any) {
          console.warn(`Groq chat with model ${modelCandidate} failed:`, err?.message || err);
        }
      }
    }

    return NextResponse.json({ text: responseText }, { status: 200 });

  } catch (err: any) {
    console.error("Journal AI Chat API error:", err);
    return NextResponse.json({ error: `AI Execution error: ${err.message || err}` }, { status: 500 });
  }
}
