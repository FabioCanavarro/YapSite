import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";
import OpenAI from "openai";

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the User
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized: Please log in" }, { status: 401 });
    }

    // 2. Parse Body
    const body = await request.json();
    const {
      text,
      entryType = "daily", // "daily" | "past_hours" | "general"
      timeWindow = "", // e.g. "Last 3 Hours"
      logId,
      customPrompt,
      customMoods,
      categories,
      tags,
    } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "Bad Request: Journal text content is required" }, { status: 400 });
    }

    const defaultMoods = customMoods || [
      { name: "Stressed", color: "#f38ba8" },
      { name: "Calm", color: "#74c7ec" },
      { name: "Focused", color: "#a6e3a1" },
      { name: "Excited", color: "#cba6f7" },
      { name: "Sad", color: "#89b4fa" },
      { name: "Tired", color: "#fab387" }
    ];

    // 3. Fetch User Knowledge Base Context if available
    const adminSupabase = createAdminClient();
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
        kbContext = `Knowledge Base Context:\nFacts: ${parsed.facts?.join(", ") || ""}\nGrowth: ${parsed.growth?.join(", ") || ""}`;
      }
    } catch (e) {
      // Non-critical
    }

    // 4. Construct AI System Prompt
    const systemPrompt = `
      You are YapSite's intelligent, empathetic journal companion.
      The user wrote a ${entryType === "daily" ? "Daily Journal entry" : entryType === "past_hours" ? `Past Few Hours (${timeWindow || "Recent"}) on-the-spot journal` : "text journal entry"}.

      ${kbContext ? kbContext + "\n" : ""}

      YOUR TASKS:
      1. CLEAN UP & STRUCTURE ("tidied_log"): Clean up grammar, fix typos, organize thoughts into clear, readable paragraphs using Markdown (bolding, lists, double line breaks). Preserve all emotional depth and raw intent.
      2. TITLE ("ai_title"): Create a compelling, concise title (3-6 words).
      3. MOOD ANALYSIS ("ai_mood_color"): Assign one exact mood color hex code from this allowed list:
${defaultMoods.map((m: any) => `         - ${m.name} -> '${m.color}'`).join("\n")}
      4. CATEGORY ("ai_category"): Assign 1 category (e.g., "Daily Reflection", "Past Hours", "Work", "Personal", "Health", "Social").
      5. TAGS ("ai_tags"): Extract 2 to 5 relevant conceptual tags.
      6. AI REVIEW & INSIGHTS ("reflections"): Write a 2-3 paragraph supportive reflection summarizing psychological insights, positive affirmations, key takeaways, and 1 gentle prompt question for further thought. Format with Markdown headers and bullet points.

      Respond STRICTLY in JSON:
      {
        "ai_title": "String",
        "ai_mood_color": "Hex string",
        "ai_category": "String",
        "ai_tags": ["tag1", "tag2"],
        "tidied_log": "Markdown string",
        "reflections": "Markdown string"
      }
    `;

    // 5. Query LLM Engine (Hack Club AI / OpenAI with Groq fallback)
    const hackClubKey = process.env.HACK_CLUB_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    let responseText: string | null = null;

    if (hackClubKey && hackClubKey !== "your-hack-club-api-key-here") {
      try {
        const client = new OpenAI({
          apiKey: hackClubKey,
          baseURL: "https://ai.hackclub.com/proxy/v1",
        });
        const res = await client.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Raw Typed Journal Entry:\n${text}` }
          ]
        });
        responseText = res.choices[0]?.message?.content || null;
      } catch (err) {
        console.warn("Hack Club AI error in text-journal API, trying Groq fallback:", err);
      }
    }

    if (!responseText && groqKey && groqKey !== "your-groq-api-key-here") {
      const client = new Groq({ apiKey: groqKey });
      let groqModels: string[] = [];
      try {
        const modelsList = await client.models.list();
        if (modelsList && Array.isArray(modelsList.data)) {
          groqModels = modelsList.data
            .map((m: any) => m.id)
            .filter((id: string) => typeof id === "string" && !id.includes("whisper") && !id.includes("vision"));
        }
      } catch (e) {}

      if (groqModels.length === 0) {
        groqModels = [
          "llama-3.3-70b-versatile",
          "llama-3.1-8b-instant",
          "llama-3.3-70b-instruct",
          "llama3.3-70b",
        ];
      }

      for (const groqModel of groqModels) {
        try {
          console.log(`[Text Journal API] Trying Groq model fallback: ${groqModel}...`);
          let res;
          try {
            res = await client.chat.completions.create({
              model: groqModel,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Raw Typed Journal Entry:\n${text}` }
              ]
            });
          } catch (fmtErr) {
            res = await client.chat.completions.create({
              model: groqModel,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Raw Typed Journal Entry:\n${text}` }
              ]
            });
          }
          const content = res.choices[0]?.message?.content;
          if (content && content.trim().length > 0) {
            responseText = content;
            console.log(`[Text Journal API] Groq model ${groqModel} fallback succeeded.`);
            break;
          }
        } catch (err: any) {
          console.warn(`[Text Journal API] Groq model ${groqModel} failed:`, err?.message || err);
        }
      }
    }

    const openrouterApiKey = process.env.OPENROUTER_API_KEY || "";
    if (!responseText && openrouterApiKey) {
      // Try OpenRouter free models fallback
      const freeModels = [
        "openrouter/free",
        "meta-llama/llama-3.3-70b-instruct",
        "google/gemini-2.0-flash-lite-001",
        "deepseek/deepseek-r1",
        "qwen/qwen-2.5-coder-32b-instruct",
        "mistralai/mistral-small-24b-instruct-2501:free",
      ];
      const openRouterClient = new OpenAI({
        apiKey: openrouterApiKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://yapsite.app",
          "X-Title": "YapSite Journal",
        },
      });

      for (const model of freeModels) {
        try {
          console.log(`[Text Journal API] Trying OpenRouter free model fallback: ${model}...`);
          let res;
          try {
            res = await openRouterClient.chat.completions.create({
              model,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Raw Typed Journal Entry:\n${text}` }
              ]
            });
          } catch (fmtErr) {
            res = await openRouterClient.chat.completions.create({
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Raw Typed Journal Entry:\n${text}` }
              ]
            });
          }
          const content = res.choices[0]?.message?.content;
          if (content && content.trim().length > 0) {
            responseText = content;
            console.log(`[Text Journal API] OpenRouter ${model} fallback succeeded.`);
            break;
          }
        } catch (orErr) {
          console.warn(`[Text Journal API] OpenRouter model ${model} failed:`, orErr);
        }
      }
    }

    // Fallback if APIs are not set up or offline
    let parsedResult = {
      ai_title: entryType === "daily" ? "Daily Journal Entry" : entryType === "past_hours" ? `Past Hours Recap (${timeWindow || "On-the-spot"})` : "Typed Journal Entry",
      ai_mood_color: "#74c7ec",
      ai_category: entryType === "daily" ? "Daily Reflection" : "Past Hours",
      ai_tags: [entryType, "typed-journal"],
      tidied_log: text,
      reflections: `### 🌟 AI Review & Reflection\nThank you for writing down your thoughts. Expressing your feelings in writing helps declutter your mind.\n\n- **Key Insight**: Regular journaling builds emotional awareness.\n- **Takeaway**: Keep up the great practice!`
    };

    if (responseText) {
      try {
        const json = JSON.parse(responseText);
        parsedResult = {
          ai_title: json.ai_title || parsedResult.ai_title,
          ai_mood_color: json.ai_mood_color || parsedResult.ai_mood_color,
          ai_category: json.ai_category || parsedResult.ai_category,
          ai_tags: Array.isArray(json.ai_tags) ? json.ai_tags : parsedResult.ai_tags,
          tidied_log: json.tidied_log || text,
          reflections: json.reflections || parsedResult.reflections,
        };
      } catch (e) {
        console.error("Failed to parse AI response json:", e);
      }
    }

    // 6. Save or Update in Supabase
    const audioUrlTag = entryType === "daily" ? "daily_journal" : entryType === "past_hours" ? "past_hours_journal" : "text_journal";
    const customTags = [
      `_category:${parsedResult.ai_category}`,
      `_entry_type:${entryType}`,
      ...(timeWindow ? [`_time_window:${timeWindow}`] : [])
    ];

    if (logId) {
      // Update existing
      const { data: updatedLog, error: updateError } = await adminSupabase
        .from("journal_logs")
        .update({
          ai_title: parsedResult.ai_title,
          ai_mood_color: parsedResult.ai_mood_color,
          raw_transcript: text,
          tidied_log: parsedResult.tidied_log,
          ai_tags: parsedResult.ai_tags,
          custom_tags: customTags,
          reflections: parsedResult.reflections,
          processing_status: "completed",
        })
        .eq("id", logId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) throw updateError;
      return NextResponse.json(updatedLog, { status: 200 });
    } else {
      // Insert new
      const { data: newLog, error: insertError } = await adminSupabase
        .from("journal_logs")
        .insert({
          user_id: user.id,
          audio_url: audioUrlTag,
          ai_title: parsedResult.ai_title,
          ai_mood_color: parsedResult.ai_mood_color,
          raw_transcript: text,
          tidied_log: parsedResult.tidied_log,
          ai_tags: parsedResult.ai_tags,
          custom_tags: customTags,
          reflections: parsedResult.reflections,
          processing_status: "completed",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return NextResponse.json(newLog, { status: 201 });
    }

  } catch (err: any) {
    console.error("Text journal processing API error:", err);
    return NextResponse.json({ error: `Internal Error: ${err.message || err}` }, { status: 500 });
  }
}
