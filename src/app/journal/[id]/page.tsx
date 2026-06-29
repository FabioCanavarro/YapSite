"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, Volume2, VolumeX, FileText, Check, 
  Save, Heart, Calendar, Loader2, Sparkles, Copy, Edit3, X
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import EchoCard from "@/components/EchoCard";
import MarkdownRenderer from "@/components/MarkdownRenderer";

interface Log {
  id: string;
  ai_title: string;
  audio_url: string;
  ai_mood_color: string;
  raw_transcript: string;
  tidied_log: string;
  ai_tags: string[];
  custom_tags: string[];
  reflections: string | null;
  processing_status: string;
  created_at: string;
}

interface Profile {
  id: string;
  name: string;
  config: any;
}

const defaultSettings = {
  removeFillerWords: true,
  enableSwearWords: false,
  customPrompt: "",
  language: "multidetect",
  customMoods: [
    { name: "Stressed", color: "#f38ba8" },
    { name: "Calm", color: "#74c7ec" },
    { name: "Focused", color: "#a6e3a1" },
    { name: "Excited", color: "#cba6f7" },
    { name: "Sad", color: "#89b4fa" },
    { name: "Tired", color: "#fab387" }
  ],
  categories: {
    mode: "open" as "open" | "flexible" | "strict",
    list: ["School", "Work", "Personal", "Health", "Social"]
  },
  tags: {
    mode: "open" as "open" | "flexible" | "strict",
    list: ["memories", "coding", "troubles", "relationships", "ideas", "dreams"]
  }
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function JournalDetail({ params }: PageProps) {
  const router = useRouter();
  const { id } = use(params);

  const [log, setLog] = useState<Log | null>(null);
  const [reflections, setReflections] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingReflections, setIsSavingReflections] = useState(false);
  const [isEditingReflections, setIsEditingReflections] = useState(false);
  const [audioPlaybackUrl, setAudioPlaybackUrl] = useState("");

  // Edit details states
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedTags, setEditedTags] = useState("");
  const [editedMoodColor, setEditedMoodColor] = useState("");
  const [editedDateTime, setEditedDateTime] = useState("");
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  // Beta features, API provider details and KB
  const [betaMode, setBetaMode] = useState(false);
  const [chatProvider, setChatProvider] = useState("hackclub");
  const [chatApiKey, setChatApiKey] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [knowledgeBase, setKnowledgeBase] = useState<any>(null);
  const [isGeneratingReflection, setIsGeneratingReflection] = useState(false);

  const [editedCategory, setEditedCategory] = useState("General");
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [showCustomCategoryInput, setShowCustomCategoryInput] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [moodsList, setMoodsList] = useState<{ name: string; color: string }[]>([
    { name: "Stressed", color: "#f38ba8" },
    { name: "Calm", color: "#74c7ec" },
    { name: "Focused", color: "#a6e3a1" },
    { name: "Excited", color: "#cba6f7" },
    { name: "Sad", color: "#89b4fa" },
    { name: "Tired", color: "#fab387" }
  ]);

  // Edit tidied thoughts state
  const [isEditingTidied, setIsEditingTidied] = useState(false);
  const [editedTidiedText, setEditedTidiedText] = useState("");
  const [isSavingTidied, setIsSavingTidied] = useState(false);

  // Sync Profiles re-analysis states
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isReanalyzePopupOpen, setIsReanalyzePopupOpen] = useState(false);
  const [selectedProfileName, setSelectedProfileName] = useState("");

  // Load profiles, categories & moods from database
  useEffect(() => {
    async function loadProfilesAndSettings() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      try {
        // Fetch knowledge base if exists
        const { data: kbData } = await supabase
          .from("journal_logs")
          .select("*")
          .eq("user_id", user.id)
          .eq("processing_status", "knowledge_base")
          .maybeSingle();

        if (kbData) {
          setKnowledgeBase(JSON.parse(kbData.raw_transcript));
        }

        const { data, error } = await supabase
          .from("journal_logs")
          .select("*")
          .eq("user_id", user.id)
          .eq("processing_status", "settings_profile");

        if (!error && data && data.length > 0) {
          const loadedProfiles = data.map((row) => ({
            id: row.id,
            name: row.ai_title || "Unnamed Profile",
            config: JSON.parse(row.raw_transcript),
          }));
          setProfiles(loadedProfiles);
          
          // Preselect active profile
          const savedActiveName = localStorage.getItem("yapsite_active_profile_name") || loadedProfiles[0].name;
          const active = loadedProfiles.find(p => p.name === savedActiveName) || loadedProfiles[0];
          setSelectedProfileName(active.name);

          setBetaMode(active.config.betaMode ?? false);
          setChatProvider(active.config.chatProvider ?? "hackclub");
          setChatApiKey(active.config.chatApiKey ?? "");
          setChatModel(active.config.chatModel ?? "");

          if (active.config.categories?.list) {
            setCategoriesList(active.config.categories.list);
          }
          if (active.config.customMoods) {
            setMoodsList(active.config.customMoods);
          }
        }
      } catch (e) {}
    }

    loadProfilesAndSettings();
  }, []);

  useEffect(() => {
    async function loadJournal() {
      setIsLoading(true);
      
      const supabase = createClient();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/");
          return;
        }

        const { data, error } = await supabase
          .from("journal_logs")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .single();

        if (error || !data) {
          toast.error("Journal entry not found.");
          router.push("/");
          return;
        }

        setLog(data);
        setReflections(data.reflections || "");
        setEditedTidiedText(data.tidied_log || "");
        setEditedTitle(data.ai_title || "");
        setEditedTags(data.ai_tags?.join(", ") || "");
        setEditedMoodColor(data.ai_mood_color || "#74c7ec");

        // Extract category
        const categoryTag = data.custom_tags?.find((t: string) => t.startsWith("_category:"));
        const categoryName = categoryTag ? categoryTag.replace("_category:", "") : "General";
        setEditedCategory(categoryName);
        
        // Convert ISO date to local string suitable for datetime-local input
        const d = new Date(data.created_at);
        const tzOffset = d.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
        setEditedDateTime(localISOTime);

        // Auto-enable reflections edit mode if empty
        setIsEditingReflections(!data.reflections);

        // Generate playback audio URL
        if (data.audio_url) {
          try {
            const urlObj = new URL(data.audio_url);
            const pathParts = urlObj.pathname.split("/audio_journals/");
            const storagePath = pathParts.length >= 2 ? decodeURIComponent(pathParts[1]) : "";
            
            if (storagePath) {
              const { data: signedData, error: signedError } = await supabase.storage
                .from("audio_journals")
                .createSignedUrl(storagePath, 3600);
              
              if (!signedError && signedData) {
                setAudioPlaybackUrl(signedData.signedUrl);
              } else {
                setAudioPlaybackUrl(data.audio_url);
              }
            } else {
              setAudioPlaybackUrl(data.audio_url);
            }
          } catch (urlErr) {
            setAudioPlaybackUrl(data.audio_url);
          }
        }
      } catch (err) {
        toast.error("Failed to load journal entry.");
        router.push("/");
      } finally {
        setIsLoading(false);
      }
    }

    loadJournal();
  }, [id, router]);

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const generateAiReflection = async () => {
    if (!log || isGeneratingReflection) return;
    setIsGeneratingReflection(true);

    const toastId = toast.loading("Generating personalized AI reflection using your Knowledge Base...");

    try {
      const kbContext = knowledgeBase 
        ? `Knowledge Base Facts:\n${knowledgeBase.facts?.join("\n") || ""}\n\n` +
          `Strengths:\n${knowledgeBase.strengths?.join("\n") || ""}\n\n` +
          `Weaknesses:\n${knowledgeBase.weaknesses?.join("\n") || ""}\n\n` +
          `Relations:\n${JSON.stringify(knowledgeBase.relations || "")}\n\n` +
          `Locations:\n${JSON.stringify(knowledgeBase.locations || "")}\n\n` +
          `Scenarios:\n${JSON.stringify(knowledgeBase.scenarios || "")}\n\n` +
          `Growth:\n${knowledgeBase.growth?.join("\n") || ""}`
        : "No compiled knowledge base available yet. Please compile it first in the dashboard.";

      const systemPrompt = `
        You are Fabio's personal AI journal companion.
        Your task is to write a warm, personalized, empathetic reflection based on the user's raw transcript and their structured Knowledge Base, and also extract the main scenario from this entry for their Knowledge Base.
        
        Knowledge Base Context:
        ${kbContext}

        Raw Transcript to Analyze:
        "${log.raw_transcript || ""}"

        You MUST respond ONLY with a valid JSON object matching this structure:
        {
          "reflection": "Write a deep, custom reflection that connects their current situation/words to their broader patterns, past scenarios, or personal growth achievements from the Knowledge Base. Suggest any patterns you notice. You may use Markdown (headers, bold, lists, horizontal lines) to structure your thoughts. Keep the response supportive, therapeutic, and highly relevant.",
          "scenario": {
            "title": "A short descriptive title of this entry's event/story (3-6 words).",
            "description": "A 1-2 sentence description of what happened in this entry.",
            "date": "${new Date(log.created_at).toLocaleDateString()}",
            "detailedSummary": "A detailed summary of the story/scenario from start to finish described in this entry.",
            "keyMoments": [
              "Key moment bullet point 1 detailing the progression of this scenario.",
              "Key moment bullet point 2.",
              "..."
            ]
          }
        }
        Do not include any markdown, commentary, or wrapper text around the JSON.
      `;

      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: "Please generate a personalized reflection/analysis on my current journal entry using my Knowledge Base context."
            }
          ],
          provider: chatProvider,
          apiKey: chatApiKey,
          model: chatModel,
          systemPrompt,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to generate AI reflection");
      }

      const resJson = await response.json();
      let aiText = resJson.text || "";

      if (!aiText) {
        throw new Error("AI did not return any reflection content.");
      }

      if (aiText.startsWith("```json")) {
        aiText = aiText.substring(7);
      }
      if (aiText.startsWith("```")) {
        aiText = aiText.substring(3);
      }
      if (aiText.endsWith("```")) {
        aiText = aiText.substring(0, aiText.length - 3);
      }
      aiText = aiText.trim();

      const parsedResult = JSON.parse(aiText);
      const reflectionText = parsedResult.reflection || "";
      const scenarioData = parsedResult.scenario;

      if (!reflectionText) {
        throw new Error("AI did not return any reflection content.");
      }

      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from("journal_logs")
        .update({ reflections: reflectionText })
        .eq("id", log.id);

      if (updateErr) throw updateErr;

      setReflections(reflectionText);
      setLog(prev => prev ? { ...prev, reflections: reflectionText } : null);

      // Append new scenario back to Knowledge Base in database
      const { data: { user } } = await supabase.auth.getUser();
      if (user && scenarioData) {
        const { data: kbData } = await supabase
          .from("journal_logs")
          .select("*")
          .eq("user_id", user.id)
          .eq("processing_status", "knowledge_base")
          .maybeSingle();

        let updatedKb: any = {
          facts: [],
          scenarios: [],
          growth: [],
          strengths: [],
          weaknesses: [],
          relations: [],
          locations: [],
          others: []
        };

        if (kbData) {
          try {
            const parsed = JSON.parse(kbData.raw_transcript);
            updatedKb = {
              ...updatedKb,
              ...parsed
            };
          } catch (e) {
            console.error("Failed to parse existing KB:", e);
          }
        }

        // Avoid duplicate scenarios by checking title match
        const exists = updatedKb.scenarios.some((s: any) => s.title.toLowerCase() === scenarioData.title.toLowerCase());
        if (!exists) {
          updatedKb.scenarios.unshift(scenarioData);
          updatedKb.lastUpdated = new Date().toISOString();

          let dbResult;
          if (kbData) {
            dbResult = await supabase
              .from("journal_logs")
              .update({
                raw_transcript: JSON.stringify(updatedKb),
                created_at: new Date().toISOString(),
              })
              .eq("id", kbData.id);
          } else {
            dbResult = await supabase
              .from("journal_logs")
              .insert({
                user_id: user.id,
                audio_url: "knowledge_base",
                ai_title: "Knowledge Base",
                raw_transcript: JSON.stringify(updatedKb),
                processing_status: "knowledge_base",
                created_at: new Date().toISOString(),
              });
          }

          if (dbResult.error) {
            console.error("Failed to save updated knowledge base with new scenario:", dbResult.error);
          } else {
            setKnowledgeBase(updatedKb);
            toast.success("AI reflection generated and entry scenario synced to Knowledge Base!", { id: toastId });
            return;
          }
        }
      }
      
      toast.success("AI reflection generated successfully!", { id: toastId });

    } catch (err: any) {
      console.error("AI reflection generation error:", err);
      toast.error(`Error generating reflection: ${err.message || err}`, { id: toastId });
    } finally {
      setIsGeneratingReflection(false);
    }
  };

  const handleReadAloud = () => {
    if (typeof window === "undefined" || !log) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      toast.info("Speech paused.");
    } else {
      const utterance = new SpeechSynthesisUtterance(log.tidied_log);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
      toast.success("Reading tidied thoughts aloud...");
    }
  };

  const handleSaveReflections = async () => {
    if (!log) return;
    setIsSavingReflections(true);

    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("journal_logs")
        .update({ reflections })
        .eq("id", id);

      if (error) throw error;

      setLog({ ...log, reflections });
      setIsEditingReflections(false);
      toast.success("Reflections updated successfully!");
    } catch (err) {
      toast.error("Failed to update reflections.");
    } finally {
      setIsSavingReflections(false);
    }
  };

  const handleSaveTidied = async () => {
    if (!log) return;
    setIsSavingTidied(true);

    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("journal_logs")
        .update({ tidied_log: editedTidiedText })
        .eq("id", id);

      if (error) throw error;

      setLog({ ...log, tidied_log: editedTidiedText });
      setIsEditingTidied(false);
      toast.success("Tidied thoughts updated successfully!");
    } catch (err) {
      toast.error("Failed to save changes.");
    } finally {
      setIsSavingTidied(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!log) return;

    setIsSavingDetails(true);
    const finalCategory = showCustomCategoryInput ? customCategoryName.trim() : editedCategory;
    if (showCustomCategoryInput && !finalCategory) {
      toast.error("Custom category name cannot be empty");
      setIsSavingDetails(false);
      return;
    }

    // Auto add to categories list in active profile if custom is created
    if (showCustomCategoryInput && finalCategory && typeof window !== "undefined") {
      const activeProfile = profiles.find(p => p.name === selectedProfileName);
      if (activeProfile) {
        const parsed = activeProfile.config;
        if (!parsed.categories.list.includes(finalCategory)) {
          parsed.categories.list.push(finalCategory);
          const supabase = createClient();
          try {
            await supabase
              .from("journal_logs")
              .update({ raw_transcript: JSON.stringify(parsed) })
              .eq("id", activeProfile.id);
            setCategoriesList(parsed.categories.list);
          } catch (e) {}
        }
      }
    }

    const parsedTags = editedTags.split(",").map(t => t.trim()).filter(Boolean);
    const newCreatedAt = new Date(editedDateTime).toISOString();

    // Prepare custom categories prefix
    const currentCustomTags = log.custom_tags || [];
    const filteredCustomTags = currentCustomTags.filter((t: string) => !t.startsWith("_category:"));
    const newCategoryTag = `_category:${finalCategory || "General"}`;
    const updatedCustomTags = [...filteredCustomTags, newCategoryTag];

    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("journal_logs")
        .update({
          ai_title: editedTitle,
          ai_tags: parsedTags,
          ai_mood_color: editedMoodColor,
          custom_tags: updatedCustomTags,
          created_at: newCreatedAt,
        })
        .eq("id", id);

      if (error) throw error;

      setLog({
        ...log,
        ai_title: editedTitle,
        ai_tags: parsedTags,
        ai_mood_color: editedMoodColor,
        custom_tags: updatedCustomTags,
        created_at: newCreatedAt,
      });
      setIsEditingDetails(false);
      setShowCustomCategoryInput(false);
      setCustomCategoryName("");
      setEditedCategory(finalCategory || "General");
      toast.success("Journal details updated successfully!");
    } catch (err) {
      toast.error("Failed to update details.");
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleReanalyze = async (profileName: string) => {
    if (!log) return;
    setIsReanalyzePopupOpen(false);
    setIsReanalyzing(true);
    toast.loading(`Re-analyzing entry with profile "${profileName}"...`, { id: "reanalyzing" });

    // Load configurations from the chosen profile
    const chosenProfile = profiles.find(p => p.name === profileName);
    const config = chosenProfile ? chosenProfile.config : defaultSettings;

    const removeFillerWords = config.removeFillerWords ?? true;
    const enableSwearWords = config.enableSwearWords ?? false;
    const customPrompt = config.customPrompt ?? "";
    const language = config.language ?? "multidetect";
    const customMoods = config.customMoods ?? [];
    const categories = config.categories ?? { mode: "open", list: [] };
    const tags = config.tags ?? { mode: "open", list: [] };

    try {
      const processRes = await fetch("/api/process-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logId: log.id,
          removeFillerWords,
          enableSwearWords,
          customPrompt,
          language,
          customMoods,
          categories,
          tags,
        }),
      });

      if (!processRes.ok) {
        throw new Error("Failed to process journal log");
      }

      const updatedLog = await processRes.json();
      setLog(updatedLog);
      
      const categoryTag = updatedLog.custom_tags?.find((t: string) => t.startsWith("_category:"));
      const categoryName = categoryTag ? categoryTag.replace("_category:", "") : "General";
      setEditedCategory(categoryName);
      setEditedTitle(updatedLog.ai_title || "");
      setEditedTags(updatedLog.ai_tags?.join(", ") || "");
      setEditedMoodColor(updatedLog.ai_mood_color || "#74c7ec");
      setEditedTidiedText(updatedLog.tidied_log || "");
      const d = new Date(updatedLog.created_at);
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
      setEditedDateTime(localISOTime);

      // Auto register spouted category & tags back in database active profile
      if (chosenProfile) {
        const parsedSettings = chosenProfile.config;
        let settingsChanged = false;
        if (categoryName && !parsedSettings.categories?.list?.includes(categoryName)) {
          parsedSettings.categories.list.push(categoryName);
          settingsChanged = true;
        }
        updatedLog.ai_tags?.forEach((t: string) => {
          if (t && !parsedSettings.tags?.list?.includes(t)) {
            parsedSettings.tags.list.push(t);
            settingsChanged = true;
          }
        });
        if (settingsChanged) {
          const supabase = createClient();
          await supabase
            .from("journal_logs")
            .update({ raw_transcript: JSON.stringify(parsedSettings) })
            .eq("id", chosenProfile.id);
          setCategoriesList(parsedSettings.categories.list);
        }
      }

      // Write run history log
      try {
        if (typeof window !== "undefined") {
          const histSaved = localStorage.getItem("yapsite_analysis_history");
          const hist = histSaved ? JSON.parse(histSaved) : [];
          hist.unshift({
            id: Math.random().toString(36).substring(7),
            timestamp: new Date().toISOString(),
            action: `Re-analysis (${profileName})`,
            title: updatedLog.ai_title || log.ai_title || "Untitled Entry",
            status: "success",
          });
          localStorage.setItem("yapsite_analysis_history", JSON.stringify(hist.slice(0, 100)));
        }
      } catch (e) {}

      toast.success("Re-analysis complete!", { id: "reanalyzing" });
    } catch (err: any) {
      console.error("Re-analysis error:", err);
      // Write failed run history log
      try {
        if (typeof window !== "undefined") {
          const histSaved = localStorage.getItem("yapsite_analysis_history");
          const hist = histSaved ? JSON.parse(histSaved) : [];
          hist.unshift({
            id: Math.random().toString(36).substring(7),
            timestamp: new Date().toISOString(),
            action: `Re-analysis (${profileName})`,
            title: log.ai_title || "Untitled Entry",
            status: "failed",
            error: err.message || String(err),
          });
          localStorage.setItem("yapsite_analysis_history", JSON.stringify(hist.slice(0, 100)));
        }
      } catch (e) {}
      toast.error(`Re-analysis failed: ${err.message || err}`, { id: "reanalyzing" });
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleCopyText = (content: string, type: "Tidied" | "Raw") => {
    if (!log) return;
    const dateFormatted = new Date(log.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    const categoryTag = log.custom_tags?.find((t: string) => t.startsWith("_category:"));
    const categoryName = categoryTag ? categoryTag.replace("_category:", "") : "General";
    
    const formattedText = `Audio Log [${dateFormatted}]
Title: ${log.ai_title || "Untitled"}
Category: ${categoryName}
Tags: ${log.ai_tags?.map(t => `#${t}`).join(" ") || ""}
----------------------------------------
${content}`;

    navigator.clipboard.writeText(formattedText);
    toast.success(`${type} thoughts copied to clipboard!`);
  };

  const handleObsidianExport = () => {
    if (!log) return;

    const title = encodeURIComponent(log.ai_title || "Journal Entry");
    const markdown = `---
tags:
  - yap-journal
  - ${log.ai_tags?.join("\n  - ")}
mood_color: ${log.ai_mood_color}
date: ${new Date(log.created_at).toISOString()}
---

# ${log.ai_title || "Untitled Voice Journal"}
*Recorded: ${new Date(log.created_at).toLocaleString()}*

## 📝 Tidied Thoughts
${log.tidied_log}

---

## 🎙️ Raw Voice Transcript
> ${log.raw_transcript}

---

## 🧠 Retroactive Reflections
${reflections || "*No reflections added yet.*"}
    `.trim();

    const payload = encodeURIComponent(markdown);
    const url = `obsidian://new?file=${title}&content=${payload}`;
    
    toast.success("Opening Obsidian exporter...");
    window.open(url, "_blank");
  };

  if (isLoading) {
    return (
      <div className="flex-1 bg-base min-h-screen pb-28 select-none">
        {/* Skeleton Header */}
        <header className="sticky top-0 z-30 bg-base/80 backdrop-blur-md border-b border-surface/50 px-4 py-4">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <div className="w-8 h-8 rounded-xl bg-surface animate-pulse" />
            <div className="h-5 w-24 bg-surface rounded-lg animate-pulse" />
            <div className="w-8 h-8 rounded-xl bg-surface animate-pulse" />
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 mt-6 flex flex-col gap-6 animate-pulse">
          {/* Skeleton Title & Metadata Card */}
          <div className="w-full rounded-3xl p-6 glass-panel border-l-4 border-l-surface flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="h-3.5 w-32 bg-surface rounded-lg" />
              <div className="h-7 w-[60%] bg-surface rounded-lg mt-1" />
            </div>
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-surface rounded-md" />
              <div className="h-5 w-20 bg-surface rounded-md" />
            </div>
          </div>

          {/* Skeleton Audio Playback Card */}
          <div className="w-full rounded-3xl p-6 glass-panel flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-surface shrink-0" />
              <div className="flex-1 h-3 bg-surface rounded-full" />
              <div className="h-3 w-10 bg-surface rounded-lg" />
            </div>
          </div>

          {/* Skeleton Tidied Thoughts Card */}
          <div className="w-full rounded-3xl p-6 glass-panel flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="h-4 w-32 bg-surface rounded-lg" />
              <div className="w-6 h-6 rounded-lg bg-surface" />
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="h-3.5 w-full bg-surface rounded-lg" />
              <div className="h-3.5 w-full bg-surface rounded-lg" />
              <div className="h-3.5 w-[90%] bg-surface rounded-lg" />
              <div className="h-3.5 w-[95%] bg-surface rounded-lg" />
              <div className="h-3.5 w-[70%] bg-surface rounded-lg" />
            </div>
          </div>

          {/* Skeleton Raw Transcript Card */}
          <div className="w-full rounded-3xl p-6 glass-panel flex flex-col gap-4">
            <div className="h-4 w-36 bg-surface rounded-lg" />
            <div className="h-3 w-[90%] bg-surface rounded-lg" />
            <div className="h-3 w-[85%] bg-surface rounded-lg" />
          </div>

          {/* Skeleton Reflections Card */}
          <div className="w-full rounded-3xl p-6 glass-panel flex flex-col gap-4">
            <div className="h-4 w-40 bg-surface rounded-lg" />
            <div className="h-3.5 w-[95%] bg-surface rounded-lg" />
            <div className="h-3.5 w-[90%] bg-surface rounded-lg" />
          </div>
        </main>
      </div>
    );
  }

  if (!log) return null;

  const dateStr = new Date(log.created_at).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <div className="flex-1 bg-base min-h-screen pb-16">
      {/* Sticky Detail Header */}
      <header className="sticky top-0 z-30 bg-base/80 backdrop-blur-md border-b border-surface/50 px-4 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-overlay hover:text-text transition-colors duration-200 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Back</span>
          </button>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsReanalyzePopupOpen(true)}
              disabled={isReanalyzing}
              className="px-3.5 py-1.5 rounded-full bg-surface hover:bg-surface-hover border border-overlay/10 text-xs font-semibold text-text flex items-center gap-1.5 transition-transform duration-200 active:scale-95 shadow-md cursor-pointer"
            >
              {isReanalyzing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-hype" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-hype" />
              )}
              <span>Re-analyze</span>
            </button>
            
            <button
              onClick={handleObsidianExport}
              className="px-3.5 py-1.5 rounded-full bg-surface hover:bg-surface-hover border border-overlay/10 text-xs font-semibold text-text flex items-center gap-1.5 transition-transform duration-200 active:scale-95 shadow-md cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Obsidian Export</span>
            </button>
          </div>
        </div>
      </header>

      {/* Re-analyze Profile Selector Dialog */}
      <AnimatePresence>
        {isReanalyzePopupOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-crust/80 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-hype/20 flex flex-col gap-4 text-left shadow-xl"
            >
              <div className="flex justify-between items-center border-b border-surface pb-2">
                <h3 className="text-sm font-bold text-text flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-hype" />
                  <span>Choose Profile for Re-analysis</span>
                </h3>
                <button
                  onClick={() => setIsReanalyzePopupOpen(false)}
                  className="text-overlay hover:text-text cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-overlay uppercase">Profile Target</label>
                <select
                  value={selectedProfileName}
                  onChange={(e) => setSelectedProfileName(e.target.value)}
                  className="w-full p-2.5 bg-crust border border-overlay/10 text-xs text-text rounded-xl focus:outline-none cursor-pointer"
                >
                  {profiles.length > 0 ? (
                    profiles.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))
                  ) : (
                    <option value="Default Profile">Default Profile</option>
                  )}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsReanalyzePopupOpen(false)}
                  className="px-4 py-2 rounded-xl bg-crust hover:bg-surface text-xs font-semibold text-overlay cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleReanalyze(selectedProfileName || "Default Profile")}
                  className="px-4 py-2 rounded-xl bg-hype text-crust text-xs font-bold hover:bg-hype/90 cursor-pointer shadow-md"
                >
                  Run Re-analysis
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Panel Content */}
      <main className="max-w-4xl mx-auto px-4 mt-6 flex flex-col gap-6">
        {/* Title & Metadata Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full rounded-3xl p-6 glass-panel border-l-4 relative overflow-hidden"
          style={{ borderLeftColor: log.ai_mood_color }}
        >
          {/* Subtle mood-colored backdrop glow */}
          <div
            className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10 pointer-events-none"
            style={{ backgroundColor: log.ai_mood_color }}
          />

          {isEditingDetails ? (
            <div className="flex flex-col gap-4 relative z-10">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-overlay uppercase">Title</label>
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-crust rounded-xl border border-overlay/10 text-text text-sm focus:outline-none focus:border-hype"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-overlay uppercase">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={editedDateTime}
                    onChange={(e) => setEditedDateTime(e.target.value)}
                    className="w-full px-3 py-2 bg-crust rounded-xl border border-overlay/10 text-text text-xs focus:outline-none focus:border-hype"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-overlay uppercase">Tags (comma separated)</label>
                  <input
                    type="text"
                    value={editedTags}
                    onChange={(e) => setEditedTags(e.target.value)}
                    className="w-full px-3 py-2 bg-crust rounded-xl border border-overlay/10 text-text text-xs focus:outline-none focus:border-hype"
                  />
                </div>
              </div>

              {/* Category selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-overlay uppercase">Broad Category</label>
                  <select
                    value={showCustomCategoryInput ? "custom" : editedCategory}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "custom") {
                        setShowCustomCategoryInput(true);
                      } else {
                        setShowCustomCategoryInput(false);
                        setEditedCategory(val);
                      }
                    }}
                    className="w-full px-3 py-2 bg-crust rounded-xl border border-overlay/10 text-text text-xs focus:outline-none focus:border-hype cursor-pointer"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="custom">+ Create custom category...</option>
                  </select>
                </div>

                {showCustomCategoryInput && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-overlay uppercase">Custom Category Name</label>
                    <input
                      type="text"
                      placeholder="e.g. school memories"
                      value={customCategoryName}
                      onChange={(e) => setCustomCategoryName(e.target.value)}
                      className="w-full px-3 py-2 bg-crust rounded-xl border border-overlay/10 text-text text-xs focus:outline-none focus:border-hype"
                    />
                  </div>
                )}
              </div>

              {/* Mood selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-overlay uppercase">Mood Color Tone</label>
                <div className="flex gap-2 flex-wrap">
                  {moodsList.map((moodItem) => (
                    <button
                      key={moodItem.color}
                      onClick={() => setEditedMoodColor(moodItem.color)}
                      title={moodItem.name}
                      type="button"
                      className={`w-6 h-6 rounded-full border transition-all duration-200 relative ${
                        editedMoodColor === moodItem.color
                          ? "scale-110 border-text"
                          : "border-transparent opacity-75 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: moodItem.color }}
                    >
                      {editedMoodColor === moodItem.color && (
                        <span className="absolute inset-0 m-auto w-2 h-2 bg-crust rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => setIsEditingDetails(false)}
                  className="px-4 py-2 rounded-xl bg-crust hover:bg-surface text-xs font-semibold text-overlay cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDetails}
                  disabled={isSavingDetails}
                  className="px-4 py-2 rounded-xl bg-hype text-crust text-xs font-bold hover:bg-hype/90 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {isSavingDetails ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-crust" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Save Details</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-start gap-4 mb-2 relative z-10">
                <span className="text-[10px] text-overlay font-light uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {dateStr}
                </span>

                <button
                  onClick={() => setIsEditingDetails(true)}
                  className="p-1.5 rounded-lg hover:bg-surface text-overlay hover:text-text transition-colors cursor-pointer"
                  title="Edit Journal Details"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>

              <h2 className="text-2xl font-extrabold tracking-tight text-text leading-snug mb-3 pr-8 text-left">
                {log.ai_title || "Untitled Entry"}
              </h2>

              <div className="flex flex-wrap gap-2 items-center mb-4">
                {/* Category Badge */}
                {(() => {
                  const categoryTag = log.custom_tags?.find((t: string) => t.startsWith("_category:"));
                  const categoryName = categoryTag ? categoryTag.replace("_category:", "") : "General";
                  return (
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-hype/15 text-hype border border-hype/20">
                      Category: {categoryName}
                    </span>
                  );
                })()}

                {log.ai_tags?.map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] px-2.5 py-0.5 rounded-full bg-surface text-text/80 font-medium"
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Audio Player */}
              {audioPlaybackUrl && (
                <div className="w-full mt-4 p-2 rounded-2xl bg-crust border border-surface/50">
                  <audio src={audioPlaybackUrl} controls className="w-full h-10 accent-hype opacity-90" />
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* Tidied Thoughts Block */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="w-full rounded-3xl p-6 glass-panel flex flex-col gap-4 text-left"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-semibold tracking-wider text-overlay uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-hype" />
              Tidied Thoughts
            </h3>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyText(log.tidied_log, "Tidied")}
                className="p-2 rounded-full border bg-surface border-overlay/10 text-text hover:text-hype hover:border-hype/20 transition-all cursor-pointer"
                title="Copy to Clipboard"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={handleReadAloud}
                className={`p-2 rounded-full border transition-colors cursor-pointer ${
                  isSpeaking 
                    ? "bg-stressed/20 border-stressed text-stressed"
                    : "bg-surface border-overlay/10 text-text hover:text-hype"
                }`}
                title={isSpeaking ? "Stop Speaking" : "Read Aloud"}
              >
                {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isEditingTidied ? (
            <>
              <textarea
                placeholder="Edit tidied thoughts here..."
                value={editedTidiedText}
                onChange={(e) => {
                  setEditedTidiedText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                  }
                }}
                className="w-full p-4 bg-crust rounded-2xl border border-overlay/10 text-text placeholder-overlay focus:outline-none focus:border-hype/50 text-sm leading-relaxed resize-none overflow-hidden font-sans"
              />

              <div className="flex gap-2.5">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveTidied}
                  disabled={isSavingTidied}
                  className="flex-1 py-3.5 px-6 rounded-2xl bg-hype text-crust font-bold flex items-center justify-center gap-2 transition-all duration-200 shadow-md cursor-pointer text-xs"
                >
                  {isSavingTidied ? (
                    <Loader2 className="w-4 h-4 animate-spin text-crust" />
                  ) : (
                    <Save className="w-4 h-4 fill-crust" />
                  )}
                  <span>Save Thoughts</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setEditedTidiedText(log.tidied_log || "");
                    setIsEditingTidied(false);
                  }}
                  disabled={isSavingTidied}
                  className="py-3.5 px-6 rounded-2xl bg-crust border border-surface hover:text-stressed text-overlay font-bold flex items-center justify-center transition-all duration-200 cursor-pointer text-xs"
                >
                  <span>Cancel</span>
                </motion.button>
              </div>
            </>
          ) : (
            <>
              <div className="text-md text-text/90 leading-relaxed font-sans tracking-wide">
                <MarkdownRenderer content={log.tidied_log || "No transcription content available."} />
              </div>
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => setIsEditingTidied(true)}
                  className="px-4 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-overlay/10 text-xs font-semibold text-text flex items-center gap-1.5 transition-transform active:scale-95 shadow-sm cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Thoughts</span>
                </button>
              </div>
            </>
          )}
        </motion.div>

        {/* Raw Voice Transcript */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full rounded-3xl p-6 glass-panel flex flex-col gap-3 text-left"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-semibold tracking-wider text-overlay uppercase">
              Raw Speech Transcript
            </h3>
            <button
              onClick={() => handleCopyText(log.raw_transcript, "Raw")}
              className="p-1.5 rounded-lg border bg-surface border-overlay/10 text-overlay hover:text-text hover:border-overlay/20 transition-all cursor-pointer"
              title="Copy to Clipboard"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-sm text-overlay leading-relaxed italic whitespace-pre-wrap pl-3 border-l border-surface">
            "{log.raw_transcript || "Empty transcript data."}"
          </div>
        </motion.div>

        {/* Therapist Vault / Reflections */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full rounded-3xl p-6 glass-panel flex flex-col gap-4 border border-hype/15 text-left"
        >
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-hype fill-hype" />
            <h3 className="text-xs font-semibold tracking-wider text-overlay uppercase">
              Therapist Vault & Reflections
            </h3>
          </div>

          {isEditingReflections ? (
            <>
              <textarea
                placeholder="Write retroactive reflections here... What did you learn? How do you feel looking back?"
                value={reflections}
                onChange={(e) => {
                  setReflections(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                  }
                }}
                className="w-full p-4 bg-crust rounded-2xl border border-overlay/10 text-text placeholder-overlay focus:outline-none focus:border-hype/50 text-sm leading-relaxed resize-none overflow-hidden"
              />

              <div className="flex gap-2.5">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveReflections}
                  disabled={isSavingReflections}
                  className="flex-1 py-3.5 px-6 rounded-2xl bg-hype text-crust font-bold flex items-center justify-center gap-2 transition-all duration-200 shadow-md cursor-pointer text-xs"
                >
                  {isSavingReflections ? (
                    <Loader2 className="w-4 h-4 animate-spin text-crust" />
                  ) : (
                    <Save className="w-4 h-4 fill-crust" />
                  )}
                  <span>Save Reflection</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setReflections(log.reflections || "");
                    setIsEditingReflections(false);
                  }}
                  disabled={isSavingReflections}
                  className="py-3.5 px-6 rounded-2xl bg-crust border border-surface hover:text-stressed text-overlay font-bold flex items-center justify-center transition-all duration-200 cursor-pointer text-xs"
                >
                  <span>Cancel</span>
                </motion.button>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-text/90 leading-relaxed font-sans">
                {log.reflections ? (
                  <MarkdownRenderer content={log.reflections} />
                ) : (
                  <span className="italic text-overlay">No retroactive reflections added yet. What did you learn? How do you feel looking back?</span>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-2">
                {betaMode && (
                  <button
                    disabled={isGeneratingReflection}
                    onClick={generateAiReflection}
                    className="px-4 py-2 rounded-xl bg-[#fab387]/10 hover:bg-[#fab387]/20 border border-[#fab387]/30 text-xs font-semibold text-[#fab387] flex items-center gap-1.5 transition-transform active:scale-95 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <span>{isGeneratingReflection ? "Thinking..." : "✨ AI Reflection"}</span>
                  </button>
                )}
                <button
                  onClick={() => setIsEditingReflections(true)}
                  className="px-4 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-overlay/10 text-xs font-semibold text-text flex items-center gap-1.5 transition-transform active:scale-95 shadow-sm cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Reflection</span>
                </button>
              </div>
            </>
          )}
        </motion.div>

        {/* Echo Matcher Card */}
        <EchoCard
          currentLogId={log.id}
          moodColor={log.ai_mood_color}
          tags={log.ai_tags}
        />
      </main>
    </div>
  );
}
