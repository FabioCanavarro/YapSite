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

    // 2. Parse request parameters
    const body = await request.json();
    const { 
      messages, 
      provider, 
      apiKey, 
      model, 
      systemPrompt 
    } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Bad Request: Missing messages array" }, { status: 400 });
    }

    // 3. Resolve API key and model selection
    let finalApiKey = apiKey || "";
    let finalModel = model || "";
    let finalProvider = provider || "hackclub";

    if (finalProvider === "hackclub") {
      if (!finalApiKey) {
        finalApiKey = process.env.HACK_CLUB_API_KEY || "";
      }
      if (!finalModel) {
        finalModel = "gpt-4o-mini";
      }
    } else if (finalProvider === "groq") {
      if (!finalApiKey) {
        finalApiKey = process.env.GROQ_API_KEY || "";
      }
      if (!finalModel) {
        finalModel = "llama-3.3-70b-versatile";
      }
    } else if (finalProvider === "custom_openai") {
      if (!finalApiKey) {
        finalApiKey = process.env.OPENAI_API_KEY || "";
      }
      if (!finalModel) {
        finalModel = "gpt-4o-mini";
      }
    }

    if (!finalApiKey) {
      return NextResponse.json({ error: `API Key is missing for provider '${finalProvider}'. Please check configuration in settings.` }, { status: 400 });
    }

    // 4. Call selected AI Provider
    let responseText = "";

    const fullMessages = [];
    if (systemPrompt) {
      fullMessages.push({ role: "system", content: systemPrompt });
    }
    
    // Format messages for the API (making sure roles match type expected by openAI/groq)
    fullMessages.push(...messages.map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content
    })));

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
      const client = new OpenAI({
        apiKey: finalApiKey,
      });
      const response = await client.chat.completions.create({
        model: finalModel,
        messages: fullMessages as any,
      });
      responseText = response.choices[0]?.message?.content || "";
    } else if (finalProvider === "groq") {
      const client = new Groq({
        apiKey: finalApiKey,
      });
      const response = await client.chat.completions.create({
        model: finalModel,
        messages: fullMessages as any,
      });
      responseText = response.choices[0]?.message?.content || "";
    }

    return NextResponse.json({ text: responseText }, { status: 200 });

  } catch (err: any) {
    console.error("AI Chat API error:", err);
    return NextResponse.json({ error: `AI execution failed: ${err.message || err}` }, { status: 500 });
  }
}
