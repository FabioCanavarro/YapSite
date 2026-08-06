"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mic, Search, LogOut, Loader2, Sparkles, Filter, 
  Trash2, ShieldCheck, ChevronRight, Calendar, Info,
  Settings, ArrowUp, ArrowDown, SlidersHorizontal, X,
  Plus, CheckSquare, Square, Play, History, Edit2, Download, MessageSquare, Clock, Edit3, Database
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import YapHeatmap from "@/components/YapHeatmap";
import BreathingRecorder from "@/components/BreathingRecorder";
import ObsidianGraph from "@/components/ObsidianGraph";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import QuickJournalModal from "@/components/QuickJournalModal";
import JournalAIChatDrawer from "@/components/JournalAIChatDrawer";
import DailyJournalCard from "@/components/DailyJournalCard";
import JournalSkeleton from "@/components/JournalSkeleton";
import DatabaseUsageModal from "@/components/DatabaseUsageModal";
import { animateSkeletonToContent, startPulseAnimation, animateStaggerList } from "@/utils/gsapAnimations";

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

interface KnowledgeBase {
  facts: string[];
  scenarios: { 
    title: string; 
    description: string; 
    date: string; 
    detailedSummary?: string; 
    keyMoments?: string[]; 
  }[];
  growth: string[];
  strengths?: string[];
  weaknesses?: string[];
  relations?: { name: string; status: string; details: string }[];
  locations?: { name: string; significance: string }[];
  others: string[];
  lastUpdated?: string;
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
  },
  betaMode: false,
  chatProvider: "hackclub" as "hackclub" | "groq" | "custom_openai",
  chatApiKey: "",
  chatModel: ""
};

const DOCS_MARKDOWN = `
# YapSite User Manual & Documentation 📘

Welcome to YapSite, your ultimate companion for voice journaling. Here is how you can use all the advanced features.

---

## 📝 Markdown Styling & Obsidian Admonitions

You can use standard Markdown syntax in your reflections or when shape-shifting thoughts. The AI will also format your journal entries with Markdown:
- Use \`# Heading 1\`, \`## Heading 2\`, and \`### Heading 3\` to structure your notes.
- Use \`**bold text**\` to emphasize key words and \`*italic text*\` for emphasis.
- Use \`---\` to add a beautiful horizontal line separator.
- Start a line with \`- \` or \`* \` to create list items.

### Obsidian Admonition Blocks
Admonition callout boxes can be rendered natively in your Tidied Thoughts or Reflections. Write a block like this:
\`\`\`ad-note
title: Daily Realization
Remember to take short breathing breaks every 45 minutes of coding.
\`\`\`
Supported types include: \`ad-note\` (blue), \`ad-warning\` (orange), \`ad-success\` (green), \`ad-danger\` (red), and \`ad-tip\` (mauve).

---

## 🧠 Categories vs. Tags

YapSite separates broad and specific details:
- **Broad Category**: Represents the general context (e.g. *School*, *Work*, *Health*, *Social*). Every journal has exactly one broad category.
- **Specific Tags**: Specific details and themes (e.g. *exam stress*, *childhood memories*, *coding bugs*). Every journal can have multiple specific tags.

### Constraint Strictness Modes
For both Categories and Tags, you can configure the AI classification behavior in Settings:
1. **Strict Mode**: The AI is forced to classify entries strictly using your predefined list. No new tags/categories will be created.
2. **Flexible Mode**: The AI will try to map the entry to your list, but is free to create a new category/tag if none of them fit the emotional or semantic tone.
3. **Open Mode**: The AI classifies entries freely and automatically appends any new category or tag to your settings list.

---

## ⚙️ Synced Device Configuration Profiles

Your settings are no longer tied to a single device's browser memory!
- All settings are saved under named **Configuration Profiles** synced directly to the Supabase database.
- You can create, rename, or delete multiple profiles (e.g. "Therapist Vault", "Brief Notes", "Deep Reflection") to instantly switch constraints.
- When re-analyzing any journal entry, a popup will ask which profile settings to apply!

---

## 🚀 Background Processing & Batch Queue

No need to wait for analysis:
- **Minimize to Background**: When you record or upload audio, you can close the recorder and keep yapping. The processing runs as a server background task. You'll receive a system notification when it completes.
- **Batch Re-Analysis**: Got multiple logs that you want to re-classify or re-analyze with your new system prompt? Use the **Batch & History** tab. Select multiple logs, click "Start Batch Re-analysis", and watch them process sequentially.
- **Offline Sync**: If you record offline, entries are saved locally using IndexedDB and will automatically upload and process as soon as your device reconnects.
- **Obsidian Sync**: Click "Obsidian Export" inside any journal entry to sync it directly with your local Obsidian vault using the \`obsidian://new\` protocol.
`;

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingPending, setIsProcessingPending] = useState(false);

  // Tab navigation state
  const [activeTab, setActiveTab] = useState<"dashboard" | "daily" | "graph" | "batch" | "chat" | "knowledge" | "documentation">("dashboard");
  const [isQuickJournalOpen, setIsQuickJournalOpen] = useState(false);
  const [selectedChatLog, setSelectedChatLog] = useState<Log | null>(null);
  const [isDbUsageModalOpen, setIsDbUsageModalOpen] = useState(false);

  // Beta features, chat and knowledge base state
  const [betaMode, setBetaMode] = useState(false);
  const [chatProvider, setChatProvider] = useState<"hackclub" | "groq" | "custom_openai">("hackclub");
  const [chatApiKey, setChatApiKey] = useState("");
  const [chatModel, setChatModel] = useState("");
  
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null);
  const [isUpdatingKb, setIsUpdatingKb] = useState(false);
  const [expandedScenarioIdx, setExpandedScenarioIdx] = useState<number | null>(null);

  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: "Hey Fabio! Ask me anything about your progress, past entries, goals, or general life patterns." }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatSending, setIsChatSending] = useState(false);

  // Settings Modal & Profiles state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileName, setActiveProfileName] = useState("Default Profile");
  const [isSyncingProfile, setIsSyncingProfile] = useState(false);

  // Active configuration states (loaded from active profile)
  const [removeFillerWords, setRemoveFillerWords] = useState(true);
  const [enableSwearWords, setEnableSwearWords] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [language, setLanguage] = useState("multidetect");
  
  // Custom moods list
  const [customMoods, setCustomMoods] = useState<{ name: string; color: string }[]>([]);
  const [newMoodName, setNewMoodName] = useState("");
  const [newMoodColor, setNewMoodColor] = useState("#cba6f7");

  // Category and Tag constraint rules
  const [categoriesConfig, setCategoriesConfig] = useState<{ mode: "open" | "flexible" | "strict"; list: string[] }>({ mode: "open", list: [] });
  const [newCategoryName, setNewCategoryName] = useState("");

  const [tagsConfig, setTagsConfig] = useState<{ mode: "open" | "flexible" | "strict"; list: string[] }>({ mode: "open", list: [] });
  const [newTagName, setNewTagName] = useState("");

  // Profiles popup state
  const [showNewProfileInput, setShowNewProfileInput] = useState(false);
  const [newProfileNameInput, setNewProfileNameInput] = useState("");
  const [showRenameProfileInput, setShowRenameProfileInput] = useState(false);
  const [renameProfileNameInput, setRenameProfileNameInput] = useState("");

  // Sorting and rearranging states
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | 'size-desc' | 'size-asc' | 'custom'>('date-desc');
  const [isRearranging, setIsRearranging] = useState(false);
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  // Batch analysis states
  const [selectedLogs, setSelectedLogs] = useState<string[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchCurrentIndex, setBatchCurrentIndex] = useState(0);
  const [batchTotalCount, setBatchTotalCount] = useState(0);
  const [batchCurrentTitle, setBatchCurrentTitle] = useState("");
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [isBatchReanalyzePopupOpen, setIsBatchReanalyzePopupOpen] = useState(false);
  const [selectedBatchProfileName, setSelectedBatchProfileName] = useState("");

  // Initialize offline sync hook
  const { isOnline } = useOfflineSync(() => fetchLogs());

  // Check user session on mount
  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUser(session.user);
        await fetchProfiles(session.user.id);
      }
      setIsLoading(false);
    }
    checkAuth();
  }, []);

  const handleGitHubLogin = async () => {
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(`GitHub login failed: ${err.message || err}`);
    }
  };

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(`Google login failed: ${err.message || err}`);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setLogs([]);
      setProfiles([]);
      toast.success("Signed out successfully.");
    } catch (err: any) {
      toast.error(`Sign out failed: ${err.message || err}`);
    }
  };

  // Load custom order & history logs from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedOrder = localStorage.getItem("yapsite_custom_order");
      if (savedOrder) {
        try {
          setCustomOrder(JSON.parse(savedOrder));
        } catch (e) {}
      }
      loadHistory();
    }
  }, []);

  const loadHistory = () => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("yapsite_analysis_history");
      if (saved) {
        try {
          setHistoryLogs(JSON.parse(saved));
        } catch (e) {}
      }
    }
  };

  const addHistoryEntry = (entry: { action: string; title: string; status: "success" | "failed"; error?: string }) => {
    if (typeof window === "undefined") return;
    const current = localStorage.getItem("yapsite_analysis_history");
    const parsed = current ? JSON.parse(current) : [];
    const newEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
      ...entry
    };
    const updated = [newEntry, ...parsed].slice(0, 100);
    localStorage.setItem("yapsite_analysis_history", JSON.stringify(updated));
    setHistoryLogs(updated);
  };

  const clearHistory = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("yapsite_analysis_history");
    setHistoryLogs([]);
    toast.success("Run history logs cleared.");
  };

  // Database settings profiles fetching
  const fetchProfiles = async (userId: string) => {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("journal_logs")
        .select("*")
        .eq("user_id", userId)
        .eq("processing_status", "settings_profile");

      if (error) throw error;

      if (data && data.length > 0) {
        const loadedProfiles = data.map((row) => {
          const config = JSON.parse(row.raw_transcript);
          return {
            id: row.id,
            name: row.ai_title || "Unnamed Profile",
            config,
          };
        });
        setProfiles(loadedProfiles);
        
        // Restore active profile from LocalStorage or pick first one
        const savedActiveName = localStorage.getItem("yapsite_active_profile_name");
        const active = loadedProfiles.find(p => p.name === savedActiveName) || loadedProfiles[0];
        setActiveProfileName(active.name);
        setSelectedBatchProfileName(active.name);
        applyProfileSettings(active.config);
      } else {
        // Create initial default profile
        const initialConfig = defaultSettings;
        const { data: newRow, error: insertError } = await supabase
          .from("journal_logs")
          .insert({
            user_id: userId,
            audio_url: "settings_profile",
            ai_title: "Default Profile",
            raw_transcript: JSON.stringify(initialConfig),
            processing_status: "settings_profile",
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) throw insertError;

        const newProfile = {
          id: newRow.id,
          name: "Default Profile",
          config: initialConfig,
        };
        setProfiles([newProfile]);
        setActiveProfileName("Default Profile");
        applyProfileSettings(initialConfig);
      }
    } catch (err) {
      console.error("Error loading profiles:", err);
      toast.error("Failed to load settings profiles.");
    }
  };

  const applyProfileSettings = (config: any) => {
    setRemoveFillerWords(config.removeFillerWords ?? true);
    setEnableSwearWords(config.enableSwearWords ?? false);
    setCustomPrompt(config.customPrompt ?? "");
    setLanguage(config.language ?? "multidetect");
    setCustomMoods(config.customMoods ?? defaultSettings.customMoods);
    setCategoriesConfig(config.categories ?? defaultSettings.categories);
    setTagsConfig(config.tags ?? defaultSettings.tags);
    setBetaMode(config.betaMode ?? false);
    setChatProvider(config.chatProvider ?? "hackclub");
    setChatApiKey(config.chatApiKey ?? "");
    setChatModel(config.chatModel ?? "");
  };

  // Unified settings save helper that syncs to DB profile
  const saveSettings = async (updatedFields: any) => {
    if (!user) return;
    setIsSyncingProfile(true);

    // Merge new config parameters
    const mergedConfig = {
      removeFillerWords,
      enableSwearWords,
      customPrompt,
      language,
      customMoods,
      categories: categoriesConfig,
      tags: tagsConfig,
      betaMode,
      chatProvider,
      chatApiKey,
      chatModel,
      ...updatedFields
    };

    // Update active state variables
    if (updatedFields.removeFillerWords !== undefined) setRemoveFillerWords(updatedFields.removeFillerWords);
    if (updatedFields.enableSwearWords !== undefined) setEnableSwearWords(updatedFields.enableSwearWords);
    if (updatedFields.customPrompt !== undefined) setCustomPrompt(updatedFields.customPrompt);
    if (updatedFields.language !== undefined) setLanguage(updatedFields.language);
    if (updatedFields.customMoods !== undefined) setCustomMoods(updatedFields.customMoods);
    if (updatedFields.categories !== undefined) setCategoriesConfig(updatedFields.categories);
    if (updatedFields.tags !== undefined) setTagsConfig(updatedFields.tags);
    if (updatedFields.betaMode !== undefined) setBetaMode(updatedFields.betaMode);
    if (updatedFields.chatProvider !== undefined) setChatProvider(updatedFields.chatProvider);
    if (updatedFields.chatApiKey !== undefined) setChatApiKey(updatedFields.chatApiKey);
    if (updatedFields.chatModel !== undefined) setChatModel(updatedFields.chatModel);

    // Sync state locally
    const updatedProfiles = profiles.map(p => 
      p.name === activeProfileName ? { ...p, config: mergedConfig } : p
    );
    setProfiles(updatedProfiles);

    // Fallback sync LocalStorage
    localStorage.setItem("yapsite_settings_v2", JSON.stringify(mergedConfig));

    // Supabase update
    const activeProfile = profiles.find(p => p.name === activeProfileName);
    if (activeProfile) {
      const supabase = createClient();
      try {
        const { error } = await supabase
          .from("journal_logs")
          .update({
            raw_transcript: JSON.stringify(mergedConfig),
          })
          .eq("id", activeProfile.id);

        if (error) throw error;
      } catch (e) {
        console.error("Database settings sync failed:", e);
      }
    }
    setIsSyncingProfile(false);
  };

  // Switch Profiles Handler
  const handleProfileSwitch = (profileName: string) => {
    const target = profiles.find(p => p.name === profileName);
    if (target) {
      setActiveProfileName(target.name);
      setSelectedBatchProfileName(target.name);
      localStorage.setItem("yapsite_active_profile_name", target.name);
      applyProfileSettings(target.config);
      toast.success(`Switched to settings profile: "${target.name}"`);
    }
  };

  // Create Profile
  const handleCreateProfile = async () => {
    const name = newProfileNameInput.trim();
    if (!name) return;
    if (profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Profile name already exists");
      return;
    }

    setIsSyncingProfile(true);
    const activeConfig = {
      removeFillerWords,
      enableSwearWords,
      customPrompt,
      language,
      customMoods,
      categories: categoriesConfig,
      tags: tagsConfig
    };

    const supabase = createClient();
    try {
      const { data: newRow, error } = await supabase
        .from("journal_logs")
        .insert({
          user_id: user.id,
          audio_url: "settings_profile",
          ai_title: name,
          raw_transcript: JSON.stringify(activeConfig),
          processing_status: "settings_profile",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      const newProfile: Profile = {
        id: newRow.id,
        name: name,
        config: activeConfig
      };
      setProfiles(prev => [...prev, newProfile]);
      setActiveProfileName(name);
      localStorage.setItem("yapsite_active_profile_name", name);
      setShowNewProfileInput(false);
      setNewProfileNameInput("");
      toast.success(`Created settings profile: "${name}"`);
    } catch (e) {
      console.error("Create profile error:", e);
      toast.error("Failed to create profile");
    } finally {
      setIsSyncingProfile(false);
    }
  };

  // Rename Profile
  const handleRenameProfile = async () => {
    const name = renameProfileNameInput.trim();
    if (!name) return;
    if (profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Profile name already exists");
      return;
    }

    const activeProfile = profiles.find(p => p.name === activeProfileName);
    if (!activeProfile) return;

    setIsSyncingProfile(true);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("journal_logs")
        .update({ ai_title: name })
        .eq("id", activeProfile.id);

      if (error) throw error;

      setProfiles(prev => prev.map(p => p.id === activeProfile.id ? { ...p, name } : p));
      setActiveProfileName(name);
      localStorage.setItem("yapsite_active_profile_name", name);
      setShowRenameProfileInput(false);
      setRenameProfileNameInput("");
      toast.success(`Profile renamed to "${name}"`);
    } catch (e) {
      console.error("Rename profile error:", e);
      toast.error("Failed to rename profile");
    } finally {
      setIsSyncingProfile(false);
    }
  };

  // Delete Profile
  const handleDeleteProfile = async () => {
    if (profiles.length <= 1) {
      toast.warning("Cannot delete the only remaining profile");
      return;
    }

    const activeProfile = profiles.find(p => p.name === activeProfileName);
    if (!activeProfile) return;

    if (!confirm(`Are you sure you want to delete profile "${activeProfileName}"?`)) return;

    setIsSyncingProfile(true);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("journal_logs")
        .delete()
        .eq("id", activeProfile.id);

      if (error) throw error;

      const remaining = profiles.filter(p => p.id !== activeProfile.id);
      setProfiles(remaining);
      const nextActive = remaining[0];
      setActiveProfileName(nextActive.name);
      localStorage.setItem("yapsite_active_profile_name", nextActive.name);
      applyProfileSettings(nextActive.config);
      toast.success(`Deleted settings profile: "${activeProfileName}"`);
    } catch (e) {
      console.error("Delete profile error:", e);
      toast.error("Failed to delete profile");
    } finally {
      setIsSyncingProfile(false);
    }
  };

  // Fetch journal entries once user state is confirmed
  const fetchKnowledgeBase = async (userId: string) => {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("journal_logs")
        .select("*")
        .eq("user_id", userId)
        .eq("processing_status", "knowledge_base")
        .maybeSingle();

      if (!error && data) {
        setKnowledgeBase(JSON.parse(data.raw_transcript));
      } else {
        setKnowledgeBase(null);
      }
    } catch (err) {
      console.error("Error fetching knowledge base:", err);
    }
  };

  const generateKnowledgeBase = async () => {
    if (!user) return;
    setIsUpdatingKb(true);

    const toastId = toast.loading("Analyzing journal logs and building Knowledge Base...");

    try {
      const supabase = createClient();
      const { data: logsData, error: fetchErr } = await supabase
        .from("journal_logs")
        .select("created_at, ai_title, raw_transcript")
        .eq("user_id", user.id)
        .neq("processing_status", "settings_profile")
        .neq("processing_status", "knowledge_base")
        .order("created_at", { ascending: false });

      if (fetchErr) throw fetchErr;

      if (!logsData || logsData.length === 0) {
        toast.error("No journal logs found. Record or upload some logs first!", { id: toastId });
        setIsUpdatingKb(false);
        return;
      }

      const logsSummary = logsData
        .map((log) => `- Date: ${new Date(log.created_at).toLocaleDateString()}, Title: "${log.ai_title || "Untitled"}", Transcript: "${log.raw_transcript || ""}"`)
        .join("\n\n");

      const systemPrompt = `
        You are a highly analytical, insightful AI personal journal compiler.
        Your task is to review the user's past journal logs and construct a unified, structured Knowledge Base of important information.
        
        CRITICAL RULES:
        - EXTRACT ONLY IMPORTANT, PERSISTENT FACTS (e.g. key preferences, core values, major challenges, health conditions, career details). Do not include trivial details.
        - SCENARIOS (Key Life Scenarios & Events): Compile a list of specific scenarios, events, or situation patterns mentioned in the journals. For each scenario, provide:
          - "title": a clear, descriptive title.
          - "description": a brief, high-level description.
          - "date": approximate date/time.
          - "detailedSummary": a detailed description of the scenario from start to finish, explaining how it evolved, what happened, and what was learnt.
          - "keyMoments": a list of bullet points (at least 3-5) describing the important moments and details from start to finish so it can act as a high-fidelity memory.
        - GROWTH: Identify areas of personal growth, resilience, positive changes, or lessons learned.
        - STRENGTHS: Extract 3-7 core personal strengths shown by the user.
        - WEAKNESSES: Extract 3-7 core personal weaknesses or areas needing improvement.
        - RELATIONS (User Relations): Detail relationships with specific people (names). For each, specify:
          - "name": the person's name.
          - "status": the state/dynamic of the relationship (e.g., good, bad, complex, group chat interactions, school dynamic, etc.).
          - "details": specific detailed descriptions of interactions or dynamics.
        - LOCATIONS: Detail any physical locations/places mentioned (e.g. workspace, specific cities, vacation spots) and their "significance" to the user.
        - OTHERS: Note any other persistent themes, goals, or important notes.
        
        You MUST respond ONLY with a valid JSON object matching the following structure:
        {
          "facts": ["Fact 1", "Fact 2", ...],
          "scenarios": [
            {
              "title": "Scenario Title",
              "description": "Short description",
              "date": "Approximate date",
              "detailedSummary": "Detailed description from start to finish",
              "keyMoments": ["Moment bullet point 1", "Moment bullet point 2", ...]
            }
          ],
          "growth": ["Growth area 1", ...],
          "strengths": ["Strength 1", ...],
          "weaknesses": ["Weakness 1", ...],
          "relations": [
            {
              "name": "Person Name",
              "status": "Good/Bad/Complex/etc",
              "details": "Details about their relationship and group chat or group dynamic"
            }
          ],
          "locations": [
            {
              "name": "Location Name",
              "significance": "Why this place matters"
            }
          ],
          "others": ["Other theme 1", ...]
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
              content: `Here are my past journal logs to analyze and build the Knowledge Base from:\n\n${logsSummary}`,
            },
          ],
          provider: chatProvider,
          apiKey: chatApiKey,
          model: chatModel,
          systemPrompt,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to call AI Chat API");
      }

      const resJson = await response.json();
      let aiText = resJson.text.trim();
      
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

      const parsedKb: KnowledgeBase = JSON.parse(aiText);
      parsedKb.lastUpdated = new Date().toISOString();

      const { data: existingRow } = await supabase
        .from("journal_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("processing_status", "knowledge_base")
        .maybeSingle();

      let dbResult;
      if (existingRow) {
        dbResult = await supabase
          .from("journal_logs")
          .update({
            raw_transcript: JSON.stringify(parsedKb),
            created_at: new Date().toISOString(),
          })
          .eq("id", existingRow.id);
      } else {
        dbResult = await supabase
          .from("journal_logs")
          .insert({
            user_id: user.id,
            audio_url: "knowledge_base",
            ai_title: "Knowledge Base",
            raw_transcript: JSON.stringify(parsedKb),
            processing_status: "knowledge_base",
            created_at: new Date().toISOString(),
          });
      }

      if (dbResult.error) throw dbResult.error;

      setKnowledgeBase(parsedKb);
      toast.success("Knowledge Base successfully compiled!", { id: toastId });

    } catch (err: any) {
      console.error("Failed to generate Knowledge Base:", err);
      toast.error(`Error generating Knowledge Base: ${err.message || err}`, { id: toastId });
    } finally {
      setIsUpdatingKb(false);
    }
  };

  const handleDownloadKb = () => {
    if (!knowledgeBase) return;
    const blob = new Blob([JSON.stringify(knowledgeBase, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "yapsite_knowledge_base.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Knowledge Base JSON downloaded!");
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || isChatSending) return;
    const userText = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userText }]);
    setIsChatSending(true);

    try {
      const logsSummary = logs
        .map((log) => `- Date: ${new Date(log.created_at).toLocaleDateString()}, Title: "${log.ai_title || "Untitled"}", Transcript: "${log.raw_transcript || ""}"`)
        .join("\n\n");

      const kbContext = knowledgeBase 
        ? `Knowledge Base Facts:\n${knowledgeBase.facts?.join("\n") || ""}\n\n` +
          `Strengths:\n${knowledgeBase.strengths?.join("\n") || ""}\n\n` +
          `Weaknesses:\n${knowledgeBase.weaknesses?.join("\n") || ""}\n\n` +
          `Relations:\n${JSON.stringify(knowledgeBase.relations || "")}\n\n` +
          `Locations:\n${JSON.stringify(knowledgeBase.locations || "")}\n\n` +
          `Scenarios:\n${JSON.stringify(knowledgeBase.scenarios || "")}\n\n` +
          `Growth:\n${knowledgeBase.growth?.join("\n") || ""}`
        : "No compiled knowledge base available yet.";

      const systemPrompt = `
        You are Fabio's personal AI journal coach and reflective companion.
        Your goal is to help him review his progress, trace life themes/scenarios, recognize areas of growth, and give helpful insights.
        
        You have access to the user's compiled Knowledge Base:
        ---
        ${kbContext}
        ---

        You also have access to his past journal logs list:
        ---
        ${logsSummary}
        ---

        Provide a supportive, thoughtful response to the user's questions. Refer to specific past entries, dates, or growth metrics where helpful to prove you remember his thoughts. You can use markdown styling (e.g. bold text, bullet points, numbered lists, horizontal lines). Keep the tone warm, clear, and engaging.
      `;

      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...chatMessages,
            { role: "user", content: userText }
          ],
          provider: chatProvider,
          apiKey: chatApiKey,
          model: chatModel,
          systemPrompt,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to process chat message");
      }

      const resJson = await response.json();
      const reply = resJson.text || "I was unable to formulate a response.";

      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);

    } catch (err: any) {
      console.error("Failed to send chat message:", err);
      setChatMessages((prev) => [
        ...prev,
        { 
          role: "assistant", 
          content: `❌ **Error:** Failed to call AI completion: ${err.message || err}. Please verify your API key configurations in the Settings panel.` 
        }
      ]);
    } finally {
      setIsChatSending(false);
    }
  };

  const fetchLogs = async () => {
    if (!user) return;

    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("journal_logs")
        .select("*")
        .neq("processing_status", "settings_profile") // Exclude settings logs
        .neq("processing_status", "knowledge_base") // Exclude knowledge base logs
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error("Error fetching logs:", err);
      toast.error("Failed to load journal logs.");
    }
  };

  // Fetch logs automatically once the user session is confirmed/changed
  useEffect(() => {
    if (user) {
      fetchLogs();
      fetchKnowledgeBase(user.id);
    }
  }, [user]);

  // Automatically process pending logs silently in the background when logs update
  useEffect(() => {
    if (logs.length > 0 && !isProcessingPending) {
      processPendingLogs();
    }
  }, [logs, isProcessingPending]);

  // Silent background processing of pending entries on load
  const processPendingLogs = async () => {
    const pending = logs.filter((log) => log.processing_status === "pending");
    if (pending.length === 0) return;

    setIsProcessingPending(true);
    toast.info(`Processing ${pending.length} pending entry in background...`);

    for (const log of pending) {
      try {
        const res = await fetch("/api/process-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            logId: log.id, 
            removeFillerWords,
            enableSwearWords,
            customPrompt,
            language,
            customMoods,
            categories: categoriesConfig,
            tags: tagsConfig,
          }),
        });

        if (res.ok) {
          const processed = await res.json();

          // Auto-register spouted labels
          if (processed) {
            const categoryTag = processed.custom_tags?.find((t: string) => t.startsWith("_category:"));
            const categoryName = categoryTag ? categoryTag.replace("_category:", "") : "General";
            registerNewCategoryAndTags(categoryName, processed.ai_tags || []);
          }

          addHistoryEntry({
            action: "Background Processing",
            title: processed.ai_title || "Untitled",
            status: "success",
          });

          // Trigger browser notification
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification("YapSite Journal Processed", {
              body: `"${processed.ai_title || "Untitled"}" is ready!`,
              icon: "/favicon.ico"
            });
          }
          toast.success(`Background audio processing complete: "${processed.ai_title}"`);
          fetchLogs();
        } else {
          addHistoryEntry({
            action: "Background Processing",
            title: log.ai_title || "Pending Entry",
            status: "failed",
            error: `Server responded with status ${res.status}`,
          });
        }
      } catch (err: any) {
        console.error("Silent sync failed for", log.id, err);
        addHistoryEntry({
          action: "Background Processing",
          title: log.ai_title || "Pending Entry",
          status: "failed",
          error: err.message || String(err),
        });
      }
    }
    setIsProcessingPending(false);
  };

  const registerNewCategoryAndTags = (category: string, tags: string[]) => {
    const activeProfile = profiles.find(p => p.name === activeProfileName);
    if (!activeProfile) return;
    try {
      const parsed = activeProfile.config;
      let changed = false;
      if (category && !parsed.categories.list.includes(category)) {
        parsed.categories.list.push(category);
        changed = true;
      }
      tags.forEach((tag) => {
        if (tag && !parsed.tags.list.includes(tag)) {
          parsed.tags.list.push(tag);
          changed = true;
        }
      });
      if (changed) {
        saveSettings({
          categories: parsed.categories,
          tags: parsed.tags
        });
      }
    } catch (e) {}
  };

  const deleteEntry = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("journal_logs")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Entry deleted.");
      fetchLogs();
    } catch (err) {
      toast.error("Failed to delete journal entry.");
    }
  };

  const moveLog = (logId: string, direction: 'up' | 'down') => {
    const currentList = [...filteredLogs];
    const index = currentList.findIndex(l => l.id === logId);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentList.length) return;

    const item = currentList[index];
    currentList.splice(index, 1);
    currentList.splice(targetIndex, 0, item);

    const newOrder = currentList.map(l => l.id);
    setCustomOrder(newOrder);
    localStorage.setItem("yapsite_custom_order", JSON.stringify(newOrder));
  };

  // Search, Filter & Sort computation
  const filteredLogs = useMemo(() => {
    const filtered = logs.filter((log) => {
      const matchesSearch = 
        log.ai_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.tidied_log?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.ai_tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
        log.custom_tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesMood = selectedMood ? log.ai_mood_color === selectedMood : true;

      return matchesSearch && matchesMood;
    });

    const getLogSize = (log: Log) => {
      const tag = log.custom_tags?.find(t => t.startsWith('_filesize:'));
      if (tag) {
        const bytes = parseInt(tag.split(':')[1], 10);
        if (!isNaN(bytes)) return bytes;
      }
      return 0;
    };

    return [...filtered].sort((a, b) => {
      if (sortBy === 'date-desc') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'date-asc') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'title-asc') {
        return (a.ai_title || '').localeCompare(b.ai_title || '');
      }
      if (sortBy === 'title-desc') {
        return (b.ai_title || '').localeCompare(a.ai_title || '');
      }
      if (sortBy === 'size-desc') {
        return getLogSize(b) - getLogSize(a);
      }
      if (sortBy === 'size-asc') {
        return getLogSize(a) - getLogSize(b);
      }
      if (sortBy === 'custom') {
        const aIdx = customOrder.indexOf(a.id);
        const bIdx = customOrder.indexOf(b.id);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return 0;
    });
  }, [logs, searchQuery, selectedMood, sortBy, customOrder]);

  // Batch analysis handlers
  const toggleSelectLog = (id: string) => {
    setSelectedLogs(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedLogs(filteredLogs.filter(l => l.processing_status === "completed").map(l => l.id));
  };

  const handleDeselectAll = () => {
    setSelectedLogs([]);
  };

  const startBatchReanalysis = async (profileName: string) => {
    if (selectedLogs.length === 0) return;

    // Load config from the chosen profile
    const chosenProfile = profiles.find(p => p.name === profileName);
    const config = chosenProfile ? chosenProfile.config : defaultSettings;

    const bRemoveFillerWords = config.removeFillerWords ?? true;
    const bEnableSwearWords = config.enableSwearWords ?? false;
    const bCustomPrompt = config.customPrompt ?? "";
    const bLanguage = config.language ?? "multidetect";
    const bCustomMoods = config.customMoods ?? [];
    const bCategories = config.categories ?? { mode: "open", list: [] };
    const bTags = config.tags ?? { mode: "open", list: [] };

    setIsProcessingBatch(true);
    setBatchTotalCount(selectedLogs.length);
    setBatchCurrentIndex(0);
    setIsBatchReanalyzePopupOpen(false);

    toast.loading(`Processing batch re-analysis queue of ${selectedLogs.length} entries with profile "${profileName}"...`, { id: "batch-run" });

    const cancelRef = { cancelled: false };
    (window as any).cancelActiveBatch = () => {
      cancelRef.cancelled = true;
    };

    let successes = 0;
    let failures = 0;

    for (let i = 0; i < selectedLogs.length; i++) {
      if (cancelRef.cancelled) {
        toast.warning("Batch analysis cancelled by user", { id: "batch-run" });
        break;
      }

      const logId = selectedLogs[i];
      const logItem = logs.find(l => l.id === logId);
      if (!logItem) continue;

      setBatchCurrentIndex(i);
      setBatchCurrentTitle(logItem.ai_title || "Untitled Entry");

      try {
        const res = await fetch("/api/process-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            logId,
            removeFillerWords: bRemoveFillerWords,
            enableSwearWords: bEnableSwearWords,
            customPrompt: bCustomPrompt,
            language: bLanguage,
            customMoods: bCustomMoods,
            categories: bCategories,
            tags: bTags
          })
        });

        if (!res.ok) {
          throw new Error(`Process error: server returned status ${res.status}`);
        }

        const processed = await res.json();
        successes++;

        // Auto register
        if (processed) {
          const categoryTag = processed.custom_tags?.find((t: string) => t.startsWith("_category:"));
          const categoryName = categoryTag ? categoryTag.replace("_category:", "") : "General";
          registerNewCategoryAndTags(categoryName, processed.ai_tags || []);
        }

        addHistoryEntry({
          action: "Batch Re-analysis",
          title: logItem.ai_title || "Untitled Entry",
          status: "success",
        });

      } catch (err: any) {
        console.error("Batch processing failed for", logId, err);
        failures++;
        addHistoryEntry({
          action: "Batch Re-analysis",
          title: logItem.ai_title || "Untitled Entry",
          status: "failed",
          error: err.message || String(err)
        });
      }
    }

    setIsProcessingBatch(false);
    setSelectedLogs([]);
    toast.success(`Batch queue processed! successes: ${successes}, failures: ${failures}`, { id: "batch-run" });
    fetchLogs();
  };

  if (isLoading) {
    return (
      <div className="flex-1 bg-base min-h-screen pb-28 select-none">
        {/* Skeleton Header */}
        <header className="sticky top-0 z-30 bg-base/80 backdrop-blur-md border-b border-surface/50 px-4 py-4">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-surface animate-pulse" />
              <div className="h-5 w-24 bg-surface rounded-lg animate-pulse" />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-4 w-12 bg-surface rounded-full animate-pulse" />
              <div className="h-7 w-20 bg-surface rounded-full animate-pulse" />
              <div className="w-8 h-8 rounded-xl bg-surface animate-pulse" />
              <div className="w-8 h-8 rounded-xl bg-surface animate-pulse" />
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 mt-6 flex flex-col gap-6 animate-pulse">
          {/* Skeleton Heatmap/Graph area placeholder */}
          <div className="w-full h-44 rounded-3xl glass-panel border border-surface/50 p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="h-4 w-36 bg-surface rounded-lg" />
              <div className="h-3 w-16 bg-surface rounded-lg" />
            </div>
            <div className="flex-1 grid grid-cols-7 gap-1 bg-crust/20 rounded-2xl p-2.5" />
          </div>

          {/* Skeleton Tabs */}
          <div className="flex gap-2 p-1.5 bg-crust/40 rounded-2xl border border-surface/40 overflow-x-auto">
            <div className="h-8 w-24 bg-surface rounded-xl" />
            <div className="h-8 w-24 bg-surface/55 rounded-xl" />
            <div className="h-8 w-24 bg-surface/55 rounded-xl" />
            <div className="h-8 w-24 bg-surface/55 rounded-xl" />
          </div>

          {/* Skeleton Search and Filters */}
          <div className="w-full flex flex-col gap-3">
            <div className="w-full h-11 bg-surface rounded-2xl" />
            <div className="flex gap-2 overflow-x-auto pb-1">
              <div className="h-8 w-16 bg-surface rounded-xl shrink-0" />
              <div className="h-8 w-16 bg-surface rounded-xl shrink-0" />
              <div className="h-8 w-16 bg-surface rounded-xl shrink-0" />
              <div className="h-8 w-16 bg-surface rounded-xl shrink-0" />
              <div className="h-8 w-16 bg-surface rounded-xl shrink-0" />
            </div>
          </div>

          {/* Skeleton List of Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                className="w-full h-36 rounded-3xl p-5 glass-panel border-l-4 border-l-surface flex flex-col gap-3"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="h-3 w-28 bg-surface rounded-lg" />
                    <div className="h-5 w-48 bg-surface rounded-lg" />
                  </div>
                  <div className="w-6 h-6 rounded-lg bg-surface shrink-0" />
                </div>
                <div className="h-3 w-full bg-surface rounded-lg" />
                <div className="h-3 w-[85%] bg-surface rounded-lg" />
                <div className="flex gap-1.5 mt-1">
                  <div className="h-4 w-12 bg-surface rounded-md" />
                  <div className="h-4 w-16 bg-surface rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // Welcome Screen (Unauthenticated)
  if (!user) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-base min-h-screen p-6 relative overflow-hidden">
        {/* Soft decorative background glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-hype/10 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-calm/10 blur-3xl" />

        <div className="w-full max-w-md text-center z-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-surface border-2 border-hype flex items-center justify-center shadow-lg shadow-hype/25"
          >
            <Mic className="w-12 h-12 text-hype" />
          </motion.div>

          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-extrabold tracking-tight text-text mb-2 font-sans"
          >
            YapSite
          </motion.h1>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-overlay font-light text-md mb-8 leading-relaxed px-4"
          >
            Talk, don't write. Let Gemini transcribe, analyze, and catalog your thoughts instantly.
          </motion.p>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col gap-3.5 w-full"
          >
            <button
              onClick={handleGitHubLogin}
              className="w-full py-3.5 px-6 rounded-2xl bg-surface hover:bg-surface/80 border border-overlay/10 hover:text-hype text-text font-medium flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer text-sm group"
            >
              <svg className="w-5 h-5 text-text group-hover:text-hype transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
              <span>Sign In with GitHub</span>
            </button>
            <button
              onClick={handleGoogleLogin}
              className="w-full py-3.5 px-6 rounded-2xl bg-surface hover:bg-surface/80 border border-overlay/10 hover:text-hype text-text font-medium flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer text-sm group"
            >
              <svg className="w-5 h-5 text-text group-hover:text-hype transition-colors shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign In with Google</span>
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // Dashboard Screen (Authenticated)
  return (
    <div className="flex-1 bg-base min-h-screen pb-28">
      {/* Premium Header */}
      <header className="sticky top-0 z-30 bg-base/80 backdrop-blur-md border-b border-surface/50 px-4 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-surface border border-hype flex items-center justify-center">
              <Mic className="w-4.5 h-4.5 text-hype" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-text">YapSite</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-productive" : "bg-stressed animate-pulse"}`} />
              <span className="text-xs text-overlay font-light hidden sm:inline">
                {isOnline ? "Online" : "Offline Mode"}
              </span>
            </div>
            
            {/* Active profile badge */}
            <span className="text-[10px] bg-crust text-hype border border-hype/20 px-2.5 py-1 rounded-full font-bold">
              {activeProfileName}
            </span>

            {/* Database & CDN Storage Usage Button */}
            <button
              onClick={() => setIsDbUsageModalOpen(true)}
              title="Database & Storage Usage"
              className="px-3 py-1.5 rounded-xl bg-sky-950/70 hover:bg-sky-900/90 border border-sky-500/40 text-sky-300 text-xs font-semibold flex items-center gap-1.5 transition-transform duration-200 active:scale-95 cursor-pointer shadow-sm"
            >
              <Database className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
              <span className="hidden sm:inline">DB Usage</span>
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
              className="p-2 rounded-xl bg-surface hover:text-hype text-text transition-colors duration-200 border border-overlay/5 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-xl bg-surface hover:text-stressed text-text transition-colors duration-200 border border-overlay/5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-crust/85 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-lg glass-panel p-6 rounded-3xl border border-hype/20 flex flex-col gap-4 shadow-xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center border-b border-surface pb-3">
                <h3 className="text-lg font-bold text-text flex items-center gap-2">
                  <Settings className="w-5 h-5 text-hype animate-[spin_10s_linear_infinite]" />
                  <span>AI Journal Settings</span>
                </h3>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1 rounded-lg hover:bg-surface text-overlay hover:text-text cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Profiles Selector and Manager */}
              <div className="flex flex-col gap-2.5 border border-hype/15 bg-crust/40 p-4 rounded-2xl text-left">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-text">Synced Config Profile</span>
                  {isSyncingProfile && (
                    <span className="text-[9px] text-hype font-mono animate-pulse">Syncing...</span>
                  )}
                </div>

                {!showNewProfileInput && !showRenameProfileInput ? (
                  <div className="flex gap-2 items-center flex-wrap">
                    <select
                      value={activeProfileName}
                      onChange={(e) => handleProfileSwitch(e.target.value)}
                      className="p-2 bg-crust border border-overlay/10 rounded-xl text-xs text-text focus:outline-none flex-1 cursor-pointer"
                    >
                      {profiles.map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => setShowNewProfileInput(true)}
                      className="p-2 border border-surface hover:text-hype text-text rounded-xl text-xs cursor-pointer font-medium"
                    >
                      New
                    </button>
                    <button
                      onClick={() => {
                        setRenameProfileNameInput(activeProfileName);
                        setShowRenameProfileInput(true);
                      }}
                      className="p-2 border border-surface hover:text-hype text-text rounded-xl text-xs cursor-pointer font-medium"
                    >
                      Rename
                    </button>
                    <button
                      onClick={handleDeleteProfile}
                      className="p-2 border border-surface hover:text-stressed text-text rounded-xl text-xs cursor-pointer font-medium"
                    >
                      Delete
                    </button>
                  </div>
                ) : showNewProfileInput ? (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="New profile name..."
                      value={newProfileNameInput}
                      onChange={(e) => setNewProfileNameInput(e.target.value)}
                      className="p-2 bg-crust border border-overlay/10 rounded-xl text-xs text-text focus:outline-none flex-1"
                    />
                    <button
                      onClick={handleCreateProfile}
                      className="px-3 py-2 bg-hype text-crust text-xs font-bold rounded-xl hover:bg-hype/90 cursor-pointer"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => setShowNewProfileInput(false)}
                      className="px-3 py-2 border border-surface text-text text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Rename profile..."
                      value={renameProfileNameInput}
                      onChange={(e) => setRenameProfileNameInput(e.target.value)}
                      className="p-2 bg-crust border border-overlay/10 rounded-xl text-xs text-text focus:outline-none flex-1"
                    />
                    <button
                      onClick={handleRenameProfile}
                      className="px-3 py-2 bg-hype text-crust text-xs font-bold rounded-xl hover:bg-hype/90 cursor-pointer"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => setShowRenameProfileInput(false)}
                      className="px-3 py-2 border border-surface text-text text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Toggles */}
              <div className="flex flex-col gap-4 text-left">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center justify-between p-3 rounded-2xl bg-crust border border-surface cursor-pointer select-none">
                    <div className="flex flex-col gap-0.5 pr-2">
                      <span className="text-xs font-bold text-text">Remove Fillers</span>
                      <span className="text-[9px] text-overlay">Strips filler terms like 'um'</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={removeFillerWords}
                      onChange={(e) => saveSettings({ removeFillerWords: e.target.checked })}
                      className="w-4 h-4 rounded border-overlay/30 bg-surface accent-hype cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-2xl bg-crust border border-surface cursor-pointer select-none">
                    <div className="flex flex-col gap-0.5 pr-2">
                      <span className="text-xs font-bold text-text">Enable Swear Words</span>
                      <span className="text-[9px] text-overlay">Keep raw curse words</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableSwearWords}
                      onChange={(e) => saveSettings({ enableSwearWords: e.target.checked })}
                      className="w-4 h-4 rounded border-overlay/30 bg-surface accent-hype cursor-pointer"
                    />
                  </label>
                </div>

                <div className="mt-1">
                  <label className="flex items-center justify-between p-3 rounded-2xl bg-[#fab387]/10 border border-[#fab387]/30 cursor-pointer select-none hover:bg-[#fab387]/15 transition-colors">
                    <div className="flex flex-col gap-0.5 pr-2">
                      <span className="text-xs font-bold text-[#fab387]">Beta Test Features</span>
                      <span className="text-[9px] text-overlay">Unlock advanced AI Chat, custom API provider configs, and the Knowledge Base</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={betaMode}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setBetaMode(enabled);
                        saveSettings({ betaMode: enabled });
                      }}
                      className="w-4 h-4 rounded border-[#fab387]/30 bg-surface accent-[#fab387] cursor-pointer"
                    />
                  </label>
                </div>

                {betaMode && (
                  <div className="flex flex-col gap-3 border border-[#fab387]/20 p-3 rounded-2xl bg-crust/50 mt-1">
                    <span className="text-xs font-bold text-[#fab387] flex items-center gap-1.5 text-left">
                      ⚙️ AI Beta Configuration
                    </span>
                    
                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-[10px] font-bold text-text">AI API Provider</label>
                      <select
                        value={chatProvider}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setChatProvider(val);
                          saveSettings({ chatProvider: val });
                        }}
                        className="bg-crust border border-overlay/10 text-[10px] p-2 rounded-xl focus:outline-none cursor-pointer text-text"
                      >
                        <option value="hackclub">Hack Club AI Proxy (Default)</option>
                        <option value="groq">Groq Cloud API</option>
                        <option value="custom_openai">Custom OpenAI API</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-[10px] font-bold text-text">API Key (Optional, falls back to env)</label>
                      <input 
                        type="password" 
                        placeholder={
                          chatProvider === "hackclub" 
                            ? "Falls back to HACK_CLUB_API_KEY..." 
                            : chatProvider === "groq" 
                              ? "Falls back to GROQ_API_KEY..." 
                              : "Falls back to OPENAI_API_KEY..."
                        }
                        value={chatApiKey} 
                        onChange={(e) => {
                          const val = e.target.value;
                          setChatApiKey(val);
                          saveSettings({ chatApiKey: val });
                        }}
                        className="bg-crust border border-overlay/10 text-[10px] text-text p-2 rounded-xl focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-[10px] font-bold text-text">Model Name</label>
                      <input 
                        type="text" 
                        placeholder={
                          chatProvider === "hackclub" 
                            ? "gpt-4o-mini" 
                            : chatProvider === "groq" 
                              ? "llama-3.3-70b-versatile" 
                              : "gpt-4o-mini"
                        }
                        value={chatModel} 
                        onChange={(e) => {
                          const val = e.target.value;
                          setChatModel(val);
                          saveSettings({ chatModel: val });
                        }}
                        className="bg-crust border border-overlay/10 text-[10px] text-text p-2 rounded-xl focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Language Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text">Transcription Language</label>
                  <select
                    value={language}
                    onChange={(e) => saveSettings({ language: e.target.value })}
                    className="w-full p-2.5 bg-crust rounded-xl border border-overlay/10 text-text text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="multidetect">Auto-Detect (Multi-language detect)</option>
                    <option value="auto">Auto-Detect (Single-language Whisper)</option>
                    <option value="en">English (US/UK)</option>
                    <option value="pt">Portuguese (Portugal/Brazil)</option>
                    <option value="es">Spanish (Spain/LATAM)</option>
                    <option value="fr">French (France)</option>
                    <option value="de">German (Germany)</option>
                    <option value="it">Italian (Italy)</option>
                    <option value="ja">Japanese (Japan)</option>
                    <option value="zh">Chinese (Mandarin)</option>
                  </select>
                </div>

                {/* Custom Moods and Accents */}
                <div className="flex flex-col gap-2 border border-surface p-3 rounded-2xl bg-crust/50">
                  <span className="text-xs font-bold text-text">Custom Moods & Accents</span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                    {customMoods.map((mood, index) => (
                      <span 
                        key={index} 
                        className="text-[9px] px-2 py-0.5 rounded-full border flex items-center gap-1 text-text/90"
                        style={{ borderColor: mood.color + "40", backgroundColor: mood.color + "15" }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: mood.color }} />
                        <span>{mood.name}</span>
                        <button
                          onClick={() => {
                            const updated = customMoods.filter((_, i) => i !== index);
                            saveSettings({ customMoods: updated });
                          }}
                          className="hover:text-stressed text-overlay cursor-pointer ml-0.5 text-[8px]"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  {/* Add mood inline form */}
                  <div className="flex gap-1.5 items-center mt-1">
                    <input 
                      type="text" 
                      placeholder="Add mood (e.g. Grateful)" 
                      value={newMoodName} 
                      onChange={(e) => setNewMoodName(e.target.value)}
                      className="bg-crust border border-overlay/10 text-[10px] text-text p-1.5 rounded-xl flex-1 focus:outline-none"
                    />
                    <input 
                      type="color" 
                      value={newMoodColor} 
                      onChange={(e) => setNewMoodColor(e.target.value)}
                      className="w-7 h-7 p-0.5 rounded-lg border border-overlay/10 bg-transparent cursor-pointer shrink-0"
                    />
                    <button
                      onClick={() => {
                        if (!newMoodName.trim()) return;
                        const exists = customMoods.some(m => m.name.toLowerCase() === newMoodName.trim().toLowerCase());
                        if (exists) {
                          toast.error("Mood name already exists");
                          return;
                        }
                        const updated = [...customMoods, { name: newMoodName.trim(), color: newMoodColor }];
                        saveSettings({ customMoods: updated });
                        setNewMoodName("");
                      }}
                      className="p-1.5 bg-hype text-crust text-[10px] font-bold rounded-xl hover:bg-hype/80 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Categories Constraint Rules */}
                <div className="flex flex-col gap-2 border border-surface p-3 rounded-2xl bg-crust/50">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-text">Broad Category Tags</span>
                    <select
                      value={categoriesConfig.mode}
                      onChange={(e) => {
                        const mode = e.target.value as any;
                        saveSettings({ categories: { ...categoriesConfig, mode } });
                      }}
                      className="bg-crust text-[9px] font-bold text-hype border border-overlay/10 px-1 py-0.5 rounded focus:outline-none cursor-pointer"
                    >
                      <option value="open">Open (Auto spout & register)</option>
                      <option value="flexible">Flexible (Prioritize list, then generate)</option>
                      <option value="strict">Strict (Strict list match)</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {categoriesConfig.list.map((cat, index) => (
                      <span key={index} className="text-[9px] bg-crust text-text/80 px-2 py-0.5 rounded border border-surface/50 flex items-center gap-1">
                        <span>{cat}</span>
                        <button
                          onClick={() => {
                            const updated = categoriesConfig.list.filter((_, i) => i !== index);
                            saveSettings({ categories: { ...categoriesConfig, list: updated } });
                          }}
                          className="text-overlay hover:text-stressed text-[8px] cursor-pointer"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5 items-center mt-1">
                    <input 
                      type="text" 
                      placeholder="Add Category..." 
                      value={newCategoryName} 
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="bg-crust border border-overlay/10 text-[10px] text-text p-1.5 rounded-xl flex-1 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        if (!newCategoryName.trim()) return;
                        if (categoriesConfig.list.includes(newCategoryName.trim())) return;
                        const updatedList = [...categoriesConfig.list, newCategoryName.trim()];
                        saveSettings({ categories: { ...categoriesConfig, list: updatedList } });
                        setNewCategoryName("");
                      }}
                      className="p-1.5 bg-hype text-crust text-[10px] font-bold rounded-xl hover:bg-hype/80 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Tags Constraint Rules */}
                <div className="flex flex-col gap-2 border border-surface p-3 rounded-2xl bg-crust/50">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-text">Specific Tag Rules</span>
                    <select
                      value={tagsConfig.mode}
                      onChange={(e) => {
                        const mode = e.target.value as any;
                        saveSettings({ tags: { ...tagsConfig, mode } });
                      }}
                      className="bg-crust text-[9px] font-bold text-hype border border-overlay/10 px-1 py-0.5 rounded focus:outline-none cursor-pointer"
                    >
                      <option value="open">Open Mode</option>
                      <option value="flexible">Flexible Mode</option>
                      <option value="strict">Strict Mode</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {tagsConfig.list.map((tag, index) => (
                      <span key={index} className="text-[9px] bg-crust text-text/80 px-2 py-0.5 rounded border border-surface/50 flex items-center gap-1">
                        <span>#{tag}</span>
                        <button
                          onClick={() => {
                            const updated = tagsConfig.list.filter((_, i) => i !== index);
                            saveSettings({ tags: { ...tagsConfig, list: updated } });
                          }}
                          className="text-overlay hover:text-stressed text-[8px] cursor-pointer"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5 items-center mt-1">
                    <input 
                      type="text" 
                      placeholder="Add specific tag..." 
                      value={newTagName} 
                      onChange={(e) => setNewTagName(e.target.value)}
                      className="bg-crust border border-overlay/10 text-[10px] text-text p-1.5 rounded-xl flex-1 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        if (!newTagName.trim()) return;
                        if (tagsConfig.list.includes(newTagName.trim())) return;
                        const updatedList = [...tagsConfig.list, newTagName.trim()];
                        saveSettings({ tags: { ...tagsConfig, list: updatedList } });
                        setNewTagName("");
                      }}
                      className="p-1.5 bg-hype text-crust text-[10px] font-bold rounded-xl hover:bg-hype/80 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Custom System Prompt Instructions */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-text">Custom AI Prompt Instructions</label>
                    <button
                      onClick={() => {
                        saveSettings({ customPrompt: "" });
                        toast.info("Prompt reset to default instructions");
                      }}
                      className="text-[10px] text-hype font-semibold hover:underline cursor-pointer"
                    >
                      Reset to Default
                    </button>
                  </div>
                  <textarea
                    placeholder="Enter custom formatting style. E.g. 'Format this like a deep psychological reflection. Use bullet points for key realizations. End with a list of actionable steps for tomorrow.'"
                    value={customPrompt}
                    onChange={(e) => saveSettings({ customPrompt: e.target.value })}
                    rows={4}
                    className="w-full p-3 bg-crust rounded-2xl border border-overlay/10 text-text placeholder-overlay focus:outline-none focus:border-hype/50 text-xs leading-relaxed resize-none font-sans"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-6 py-2.5 rounded-full bg-hype text-crust font-bold text-xs hover:bg-hype/90 transition-transform active:scale-95 cursor-pointer shadow-md"
                >
                  Close & Apply
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 mt-6 flex flex-col gap-6">
        
        {/* Navigation Tabs */}
        <div className="flex bg-surface border border-overlay/10 rounded-2xl p-1 overflow-x-auto gap-1">
          {[
            { id: "dashboard", label: "Dashboard" },
            { id: "daily", label: "🗓️ Daily & Typed Journals" },
            { id: "graph", label: "Mind Graph" },
            { id: "batch", label: "Batch & History" },
            ...(betaMode ? [
              { id: "chat", label: "AI Chat" },
              { id: "knowledge", label: "Knowledge Base" }
            ] : []),
            { id: "documentation", label: "Documentation" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer shrink-0 ${
                activeTab === tab.id
                  ? "bg-hype text-crust shadow-md scale-102"
                  : "text-text hover:text-hype hover:bg-crust/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Render Switcher */}
        {activeTab === "dashboard" && (
          <div className="flex flex-col gap-6">
            {/* Heatmap Grid */}
            <YapHeatmap logs={logs} />

            {/* Search and Filters */}
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-overlay" />
                <input
                  type="text"
                  placeholder="Search title, content, categories, or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-surface rounded-2xl border border-overlay/10 text-text placeholder-overlay focus:outline-none focus:border-hype/50 text-sm transition-colors duration-200"
                />
              </div>

              {/* Sorting and Rearrange Row */}
              <div className="flex flex-wrap gap-2.5 items-center justify-between">
                <div className="flex items-center gap-1.5 bg-surface border border-overlay/10 rounded-2xl px-3.5 py-2 shrink-0">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-overlay" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent text-text text-xs focus:outline-none cursor-pointer pr-1"
                  >
                    <option value="date-desc">Newest Date</option>
                    <option value="date-asc">Oldest Date</option>
                    <option value="title-asc">Title (A-Z)</option>
                    <option value="title-desc">Title (Z-A)</option>
                    <option value="size-desc">File Size (Large)</option>
                    <option value="size-asc">File Size (Small)</option>
                    <option value="custom">Custom Order</option>
                  </select>
                </div>

                <button
                  onClick={() => {
                    setIsRearranging(!isRearranging);
                    if (!isRearranging) {
                      setSortBy('custom');
                      toast.info("Rearrange active: Use arrows on logs to order them manually");
                    }
                  }}
                  className={`text-xs px-3.5 py-2 rounded-2xl border transition-all duration-200 flex items-center gap-1.5 cursor-pointer font-semibold ${
                    isRearranging
                      ? "bg-hype text-crust border-hype"
                      : "bg-surface text-text border-overlay/10 hover:border-hype/30"
                  }`}
                >
                  <span>Rearrange Logs</span>
                </button>
              </div>

              {/* Tag / Mood Filter pills */}
              <div className="flex gap-2 items-center overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setSelectedMood(null)}
                  className={`text-xs px-3.5 py-2 rounded-full border shrink-0 transition-all duration-200 cursor-pointer ${
                    selectedMood === null
                      ? "bg-text text-crust border-text font-semibold"
                      : "bg-surface text-text border-overlay/10"
                  }`}
                >
                  All Moods
                </button>
                {customMoods.map((mood) => (
                  <button
                    key={mood.color}
                    onClick={() => setSelectedMood(mood.color)}
                    className="text-xs px-3.5 py-2 rounded-full border shrink-0 flex items-center gap-1.5 transition-all duration-200 cursor-pointer"
                    style={{
                      backgroundColor: selectedMood === mood.color ? mood.color : "transparent",
                      color: selectedMood === mood.color ? "#11111b" : "#cdd6f4",
                      borderColor: selectedMood === mood.color ? mood.color : "rgba(76, 79, 105, 0.1)"
                    }}
                  >
                    <span 
                      className="w-2.5 h-2.5 rounded-full" 
                      style={{ backgroundColor: selectedMood === mood.color ? "#11111b" : mood.color }} 
                    />
                    <span>{mood.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Entries Header */}
            <div className="flex justify-between items-center">
              <h2 className="text-md font-bold tracking-wide text-text uppercase">
                Journal Entries
              </h2>
              <span className="text-xs text-overlay font-light">
                Showing {filteredLogs.length} entries
              </span>
            </div>

            {/* Logs List Container */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredLogs.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="col-span-1 md:col-span-2 glass-panel rounded-3xl p-8 text-center text-overlay text-sm font-light"
                  >
                    No journals match your search filters.
                  </motion.div>
                ) : (
                  filteredLogs.map((log, index) => {
                    const dateStr = new Date(log.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });

                    const sizeTag = log.custom_tags?.find((t) => t.startsWith("_filesize:"));
                    let formattedSize = "";
                    if (sizeTag) {
                      const bytes = parseInt(sizeTag.split(":")[1], 10);
                      if (!isNaN(bytes)) {
                        if (bytes > 1024 * 1024) {
                          formattedSize = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                        } else {
                          formattedSize = `${(bytes / 1024).toFixed(0)} KB`;
                        }
                      }
                    }

                    return (
                      <motion.div
                        key={log.id}
                        layout
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3) }}
                        onClick={() => router.push(`/journal/${log.id}`)}
                        className="w-full relative overflow-hidden rounded-3xl p-5 cursor-pointer glass-panel glass-panel-hover flex flex-col gap-3 group text-left"
                        style={{
                          borderLeft: `4px solid ${log.ai_mood_color || "#313244"}`,
                        }}
                      >
                        {/* Background glow tint matching the mood color */}
                        <div
                          className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-300 pointer-events-none"
                          style={{ backgroundColor: log.ai_mood_color || "transparent" }}
                        />

                        <div className="flex justify-between items-start gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-[10px] text-overlay font-light uppercase tracking-wider flex items-center gap-1 shrink-0">
                                <Calendar className="w-3.5 h-3.5" />
                                {dateStr}
                              </span>
                              {formattedSize && (
                                <span className="text-[9px] text-overlay font-mono bg-crust/50 px-1.5 py-0.5 rounded border border-surface shrink-0">
                                  {formattedSize}
                                </span>
                              )}
                              {log.processing_status === "pending" && (
                                <span className="text-[9px] bg-hype/20 text-hype px-1.5 py-0.5 rounded font-mono animate-pulse shrink-0">
                                  Processing...
                                </span>
                              )}
                            </div>
                            <h3 className="text-md font-bold text-text group-hover:text-hype transition-colors duration-200 leading-snug truncate pr-6">
                              {log.ai_title || "Untitled Entry"}
                            </h3>
                          </div>
                          
                          {/* Rearrange arrows */}
                          {isRearranging && (
                            <div className="flex items-center gap-1 z-20 shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  moveLog(log.id, 'up');
                                }}
                                className="p-1 rounded bg-crust hover:bg-surface text-overlay hover:text-hype border border-surface cursor-pointer"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  moveLog(log.id, 'down');
                                }}
                                className="p-1 rounded bg-crust hover:bg-surface text-overlay hover:text-hype border border-surface cursor-pointer"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          <button
                            onClick={(e) => deleteEntry(log.id, e)}
                            className="p-1.5 rounded-lg hover:bg-crust hover:text-stressed text-overlay transition-colors cursor-pointer shrink-0 z-20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <p className="text-xs text-text/80 line-clamp-2 leading-relaxed">
                          {log.tidied_log}
                        </p>

                        {/* Tag Pills */}
                        <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                          {/* Category Tag Display */}
                          {(() => {
                            const categoryTag = log.custom_tags?.find((t) => t.startsWith("_category:"));
                            const categoryName = categoryTag ? categoryTag.replace("_category:", "") : "General";
                            return (
                              <span className="text-[9px] px-2 py-0.5 rounded bg-hype/15 text-hype font-bold border border-hype/10 uppercase tracking-wider">
                                {categoryName}
                              </span>
                            );
                          })()}

                          {log.ai_tags?.map((tag, tIdx) => (
                            <span
                              key={tIdx}
                              className="text-[9px] px-2.5 py-0.5 rounded-full bg-crust text-text/70 border border-surface"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Tab Daily & Typed Journals */}
        {activeTab === "daily" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/80 backdrop-blur-md p-6 rounded-3xl border border-purple-900/40 shadow-xl">
              <div>
                <h2 className="text-xl font-extrabold text-slate-100 flex items-center gap-2">
                  🗓️ Daily & On-The-Spot Journals
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Access your daily recaps, past-few-hours entries, and typed journals on the spot.
                </p>
              </div>

              <button
                onClick={() => setIsQuickJournalOpen(true)}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs md:text-sm flex items-center gap-2 shadow-lg shadow-purple-900/40 transition active:scale-95 cursor-pointer shrink-0"
              >
                <Edit3 className="w-4 h-4" />
                + Write Daily Journal
              </button>
            </div>

            {/* Daily & Typed Logs Grid */}
            {(() => {
              const dailyLogs = logs.filter(
                (l) =>
                  l.audio_url === "daily_journal" ||
                  l.audio_url === "past_hours_journal" ||
                  l.audio_url === "text_journal" ||
                  l.custom_tags?.some(
                    (t) =>
                      t.startsWith("_category:Daily Reflection") ||
                      t.startsWith("_category:Past Hours") ||
                      t.startsWith("_entry_type:")
                  )
              );

              if (dailyLogs.length === 0) {
                return (
                  <div className="glass-panel rounded-3xl p-10 text-center space-y-4 border border-purple-900/30">
                    <div className="w-16 h-16 mx-auto rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-2xl">
                      📝
                    </div>
                    <h3 className="text-base font-bold text-slate-200">
                      No Daily Journal Entries Yet
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Start journaling by typing on the spot, recapping your past 3 hours, or recording your daily highlights!
                    </p>
                    <button
                      onClick={() => setIsQuickJournalOpen(true)}
                      className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition cursor-pointer"
                    >
                      Write First Entry
                    </button>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {dailyLogs.map((log) => (
                    <DailyJournalCard
                      key={log.id}
                      log={log}
                      onOpenChat={(selectedLog) => setSelectedChatLog(selectedLog)}
                    />
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Tab Graph */}
        {activeTab === "graph" && (
          <div className="flex flex-col gap-4">
            <h2 className="text-md font-bold tracking-wide text-text uppercase text-left">
              Mind Obsidian Graph
            </h2>
            <ObsidianGraph logs={logs.filter(l => l.processing_status === "completed")} />
          </div>
        )}

        {/* Tab Batch queue & run history logs */}
        {activeTab === "batch" && (
          <div className="flex flex-col gap-6 text-left">
            {/* Batch processing panel */}
            <div className="w-full rounded-3xl p-6 glass-panel border border-surface/50 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-md font-bold text-text">Batch Re-Analysis Queue</h3>
                  <p className="text-[11px] text-overlay font-light mt-0.5">
                    Select multiple audio journals to re-run AI processing with your current prompts/rules.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 border border-surface hover:text-hype text-text text-xs rounded-xl cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    className="px-3 py-1.5 border border-surface hover:text-hype text-text text-xs rounded-xl cursor-pointer"
                  >
                    Clear Select
                  </button>
                </div>
              </div>

              {/* Progress UI when processing */}
              {isProcessingBatch && (
                <div className="w-full p-4 bg-crust border border-hype/20 rounded-2xl flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-hype animate-spin" />
                      <span className="text-xs font-bold text-text">
                        Processing index {batchCurrentIndex + 1} of {batchTotalCount}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        if ((window as any).cancelActiveBatch) {
                          (window as any).cancelActiveBatch();
                        }
                      }}
                      className="px-3 py-1 bg-stressed/20 text-stressed hover:bg-stressed text-[10px] font-bold rounded-lg cursor-pointer"
                    >
                      Cancel Batch
                    </button>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full bg-surface h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-hype h-full rounded-full transition-all duration-300"
                      style={{ width: `${((batchCurrentIndex + 1) / batchTotalCount) * 100}%` }}
                    />
                  </div>

                  <span className="text-[10px] text-overlay truncate">
                    Current file: <strong className="text-text">"{batchCurrentTitle}"</strong>
                  </span>
                </div>
              )}

              {/* Logs Checklist */}
              <div className="flex flex-col gap-2.5 max-h-[350px] overflow-y-auto pr-1">
                {logs.filter(l => l.processing_status === "completed").map((logItem) => {
                  const isChecked = selectedLogs.includes(logItem.id);
                  const logCategoryTag = logItem.custom_tags?.find((t) => t.startsWith("_category:"));
                  const logCategoryName = logCategoryTag ? logCategoryTag.replace("_category:", "") : "General";

                  return (
                    <div 
                      key={logItem.id}
                      onClick={() => !isProcessingBatch && toggleSelectLog(logItem.id)}
                      className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all duration-200 ${
                        isChecked 
                          ? "bg-hype/5 border-hype/30" 
                          : "bg-surface/50 border-surface hover:border-hype/20"
                      } ${isProcessingBatch ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-hype shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-overlay shrink-0" />
                        )}
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-text truncate pr-4">{logItem.ai_title}</h4>
                          <div className="flex gap-1.5 items-center mt-0.5">
                            <span className="text-[8px] bg-crust text-overlay px-1.5 py-0.5 rounded border border-surface uppercase tracking-wider">
                              {logCategoryName}
                            </span>
                            <span className="text-[8px] text-overlay">
                              {new Date(logItem.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0" 
                        style={{ backgroundColor: logItem.ai_mood_color }} 
                      />
                    </div>
                  );
                })}
              </div>

              {/* Action trigger button */}
              <button
                onClick={() => setIsBatchReanalyzePopupOpen(true)}
                disabled={selectedLogs.length === 0 || isProcessingBatch}
                className="w-full py-3.5 bg-hype disabled:bg-surface disabled:text-overlay disabled:cursor-not-allowed text-crust font-extrabold text-xs rounded-2xl flex items-center justify-center gap-2 hover:bg-hype/90 transition-all cursor-pointer shadow-md"
              >
                <Play className="w-4 h-4 fill-crust" />
                <span>Start Batch Re-analysis ({selectedLogs.length} entries selected)</span>
              </button>
            </div>

            {/* Run history list */}
            <div className="w-full rounded-3xl p-6 glass-panel border border-surface/50 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-md font-bold text-text flex items-center gap-1.5">
                    <History className="w-4 h-4 text-hype" />
                    <span>Process Run Audit History</span>
                  </h3>
                  <p className="text-[11px] text-overlay font-light mt-0.5">
                    Audit trail showing status outcomes of background and manual AI operations.
                  </p>
                </div>
                <button
                  onClick={clearHistory}
                  disabled={historyLogs.length === 0}
                  className="px-3 py-1.5 text-xs border border-surface hover:text-stressed text-text rounded-xl disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Clear History
                </button>
              </div>

              {historyLogs.length === 0 ? (
                <div className="p-8 text-center text-overlay font-light text-xs italic">
                  No process audits available yet. Run re-analysis or record entries.
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                  {historyLogs.map((hItem) => {
                    const hDate = new Date(hItem.timestamp).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });
                    const isSuccess = hItem.status === "success";

                    return (
                      <div 
                        key={hItem.id}
                        className="p-3 bg-crust/50 border border-surface/50 rounded-2xl flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[8px] text-overlay font-mono">{hDate}</span>
                            <span className="text-[9px] bg-surface text-hype font-bold px-1.5 py-0.2 rounded border border-surface uppercase tracking-wider">
                              {hItem.action}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-text truncate mt-1">"{hItem.title}"</h4>
                          {!isSuccess && hItem.error && (
                            <p className="text-[9px] text-stressed font-mono mt-0.5 leading-snug">{hItem.error}</p>
                          )}
                        </div>

                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                          isSuccess ? "bg-productive/15 text-productive" : "bg-stressed/15 text-stressed"
                        }`}>
                          {hItem.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Documentation */}
        {activeTab === "documentation" && (
          <div className="w-full rounded-3xl p-6 glass-panel border border-surface/50 text-left">
            <MarkdownRenderer content={DOCS_MARKDOWN} />
          </div>
        )}

        {/* Tab AI Chat */}
        {activeTab === "chat" && (
          <div className="flex flex-col bg-surface border border-overlay/10 rounded-3xl p-5 shadow-lg h-[600px]">
            {/* Header */}
            <div className="border-b border-overlay/10 pb-3 mb-4 text-left flex justify-between items-center">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-md font-bold text-text flex items-center gap-1.5">
                  💬 Growth Companion Chat
                </h2>
                <p className="text-[10px] text-overlay">Ask about patterns, progress, or insights from your journals</p>
              </div>
              <button
                onClick={() => setChatMessages([
                  { role: 'assistant', content: "Hey Fabio! Ask me anything about your progress, past entries, goals, or general life patterns." }
                ])}
                className="px-2.5 py-1.5 rounded-lg border border-surface text-[10px] text-text hover:text-[#f38ba8] cursor-pointer hover:bg-crust transition-colors"
                title="Clear Chat History"
              >
                Clear History
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1 mb-4 select-text">
              {chatMessages.map((msg, index) => (
                <div 
                  key={index}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] rounded-2xl p-3.5 shadow-sm text-left text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-hype text-crust font-semibold rounded-br-none'
                      : 'bg-crust/50 border border-surface text-text rounded-bl-none'
                  }`}>
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}
                  </div>
                </div>
              ))}
              {isChatSending && (
                <div className="flex justify-start">
                  <div className="bg-crust/50 border border-surface text-text rounded-2xl rounded-bl-none p-3.5 flex items-center gap-2">
                    <span className="text-[11px] text-overlay animate-pulse">Assistant is typing...</span>
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-hype animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-hype animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-hype animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Row */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ask about your yaps..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSendChatMessage();
                  }
                }}
                disabled={isChatSending}
                className="flex-1 bg-crust border border-overlay/10 rounded-2xl px-4 py-3 text-xs text-text placeholder-overlay focus:outline-none focus:border-hype/50"
              />
              <button
                onClick={handleSendChatMessage}
                disabled={isChatSending || !chatInput.trim()}
                className="px-5 rounded-2xl bg-hype text-crust font-bold text-xs hover:bg-hype/90 disabled:opacity-50 transition-transform active:scale-95 cursor-pointer flex items-center justify-center"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Tab Knowledge Base */}
        {activeTab === "knowledge" && (
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center bg-surface border border-overlay/10 rounded-3xl p-6 shadow-sm">
              <div className="flex flex-col gap-1 text-left">
                <h2 className="text-lg font-bold text-text">🧠 Compiled Knowledge Base</h2>
                <p className="text-xs text-overlay">
                  {knowledgeBase?.lastUpdated 
                    ? `Last compiled: ${new Date(knowledgeBase.lastUpdated).toLocaleString()}` 
                    : "No compiled knowledge base found yet. Click below to analyze your journals."}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {knowledgeBase && (
                  <button
                    onClick={handleDownloadKb}
                    className="px-4 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-overlay/10 text-xs font-bold text-text transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5"
                    title="Download KB as JSON"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON</span>
                  </button>
                )}
                <button
                  disabled={isUpdatingKb}
                  onClick={generateKnowledgeBase}
                  className="px-4 py-2 rounded-xl bg-hype text-crust font-bold text-xs hover:bg-hype/90 disabled:opacity-50 transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  {isUpdatingKb ? "Compiling..." : "🔄 Compile / Refresh"}
                </button>
              </div>
            </div>

            {knowledgeBase ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Important Facts Card */}
                <div className="glass-panel p-5 rounded-3xl flex flex-col gap-3 text-left">
                  <h3 className="text-sm font-bold text-[#cba6f7] uppercase tracking-wider border-b border-overlay/10 pb-2">
                    📌 Core Facts & Preferences
                  </h3>
                  {knowledgeBase.facts && knowledgeBase.facts.length > 0 ? (
                    <ul className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1">
                      {knowledgeBase.facts.map((fact, index) => (
                        <li key={index} className="text-xs text-text/90 leading-relaxed flex items-start gap-2">
                          <span className="text-hype shrink-0">•</span>
                          <span>{fact}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-overlay italic">No important facts compiled yet.</p>
                  )}
                </div>

                {/* Personal Growth Card */}
                <div className="glass-panel p-5 rounded-3xl flex flex-col gap-3 text-left">
                  <h3 className="text-sm font-bold text-[#a6e3a1] uppercase tracking-wider border-b border-overlay/10 pb-2">
                    📈 Personal Growth & Lessons
                  </h3>
                  {knowledgeBase.growth && knowledgeBase.growth.length > 0 ? (
                    <ul className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1">
                      {knowledgeBase.growth.map((growthPoint, index) => (
                        <li key={index} className="text-xs text-text/90 leading-relaxed flex items-start gap-2">
                          <span className="text-hype shrink-0">✓</span>
                          <span>{growthPoint}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-overlay italic">No growth areas compiled yet.</p>
                  )}
                </div>

                {/* Strengths & Weaknesses Card */}
                <div className="glass-panel p-5 rounded-3xl md:col-span-2 flex flex-col gap-4 text-left">
                  <h3 className="text-sm font-bold text-[#fab387] uppercase tracking-wider border-b border-overlay/10 pb-2">
                    💪 Strengths & Weaknesses
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Strengths */}
                    <div className="flex flex-col gap-2">
                      <h4 className="text-[11px] font-bold text-[#a6e3a1] uppercase tracking-wide">Strengths</h4>
                      {knowledgeBase.strengths && knowledgeBase.strengths.length > 0 ? (
                        <ul className="flex flex-col gap-2">
                          {knowledgeBase.strengths.map((str, idx) => (
                            <li key={idx} className="text-xs text-text/80 leading-relaxed flex items-start gap-1.5">
                              <span className="text-[#a6e3a1]">•</span>
                              <span>{str}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-overlay italic">No strengths compiled yet.</p>
                      )}
                    </div>
                    {/* Weaknesses */}
                    <div className="flex flex-col gap-2">
                      <h4 className="text-[11px] font-bold text-[#f38ba8] uppercase tracking-wide">Weaknesses</h4>
                      {knowledgeBase.weaknesses && knowledgeBase.weaknesses.length > 0 ? (
                        <ul className="flex flex-col gap-2">
                          {knowledgeBase.weaknesses.map((weak, idx) => (
                            <li key={idx} className="text-xs text-text/80 leading-relaxed flex items-start gap-1.5">
                              <span className="text-[#f38ba8]">•</span>
                              <span>{weak}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-overlay italic">No weaknesses compiled yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* User Relations Card */}
                <div className="glass-panel p-5 rounded-3xl md:col-span-2 flex flex-col gap-3 text-left">
                  <h3 className="text-sm font-bold text-[#f5c2e7] uppercase tracking-wider border-b border-overlay/10 pb-2">
                    👥 User Relations
                  </h3>
                  {knowledgeBase.relations && knowledgeBase.relations.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-80 overflow-y-auto pr-1">
                      {knowledgeBase.relations.map((relation, idx) => {
                        const isGood = relation.status.toLowerCase().includes("good");
                        const isBad = relation.status.toLowerCase().includes("bad");
                        const badgeColor = isGood 
                          ? "bg-[#a6e3a1]/15 text-[#a6e3a1] border-[#a6e3a1]/20" 
                          : isBad 
                            ? "bg-[#f38ba8]/15 text-[#f38ba8] border-[#f38ba8]/20" 
                            : "bg-[#f9e2af]/15 text-[#f9e2af] border-[#f9e2af]/20";
                        return (
                          <div key={idx} className="p-3 bg-crust/40 border border-surface/50 rounded-2xl flex flex-col gap-1.5">
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-xs font-bold text-text">{relation.name}</span>
                              <span className={`text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                                {relation.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-text/75 leading-relaxed">{relation.details}</p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-overlay italic">No relationships tracked yet.</p>
                  )}
                </div>

                {/* Locations Card */}
                <div className="glass-panel p-5 rounded-3xl md:col-span-2 flex flex-col gap-3 text-left">
                  <h3 className="text-sm font-bold text-[#89b4fa] uppercase tracking-wider border-b border-overlay/10 pb-2">
                    📍 Key Locations
                  </h3>
                  {knowledgeBase.locations && knowledgeBase.locations.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                      {knowledgeBase.locations.map((loc, idx) => (
                        <div key={idx} className="p-2.5 bg-crust/40 border border-surface/50 rounded-xl flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-text">{loc.name}</span>
                          <span className="text-[10px] text-text/70 leading-normal">{loc.significance}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-overlay italic">No locations tracked yet.</p>
                  )}
                </div>

                {/* Scenarios / Events list Card */}
                <div className="glass-panel p-5 rounded-3xl md:col-span-2 flex flex-col gap-3 text-left">
                  <h3 className="text-sm font-bold text-[#74c7ec] uppercase tracking-wider border-b border-overlay/10 pb-2">
                    🎬 Key Life Scenarios & Events
                  </h3>
                  {knowledgeBase.scenarios && knowledgeBase.scenarios.length > 0 ? (
                    <div className="flex flex-col gap-3 max-h-[36rem] overflow-y-auto pr-1 text-left">
                      {knowledgeBase.scenarios.map((scenario, index) => {
                        const isExpanded = expandedScenarioIdx === index;
                        return (
                          <div 
                            key={index} 
                            onClick={() => setExpandedScenarioIdx(isExpanded ? null : index)}
                            className="p-4 bg-crust/50 hover:bg-crust/80 border border-surface rounded-2xl flex flex-col gap-2 transition-all cursor-pointer select-none"
                          >
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-text hover:text-hype transition-colors">{scenario.title}</span>
                                <span className="text-[10px] text-text/80 mt-0.5">{scenario.description}</span>
                              </div>
                              <span className="text-[9px] font-mono text-overlay shrink-0 bg-surface px-1.5 py-0.5 rounded border border-overlay/5">
                                {scenario.date}
                              </span>
                            </div>

                            <AnimatePresence initial={false}>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden border-t border-surface/50 pt-2.5 mt-1 flex flex-col gap-3 text-left"
                                >
                                  {scenario.detailedSummary && (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[9px] uppercase tracking-wider font-semibold text-overlay">Detailed Summary</span>
                                      <p className="text-[11px] text-text/80 leading-relaxed font-sans">{scenario.detailedSummary}</p>
                                    </div>
                                  )}
                                  {scenario.keyMoments && scenario.keyMoments.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                      <span className="text-[9px] uppercase tracking-wider font-semibold text-overlay">Key Moments (Chronology)</span>
                                      <ul className="flex flex-col gap-1.5 pl-1">
                                        {scenario.keyMoments.map((moment, mIdx) => (
                                          <li key={mIdx} className="text-[11px] text-text/80 leading-relaxed flex items-start gap-2">
                                            <span className="text-hype shrink-0">•</span>
                                            <span>{moment}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-overlay italic">No scenarios compiled yet.</p>
                  )}
                </div>

                {/* Other Themes Card */}
                {knowledgeBase.others && knowledgeBase.others.length > 0 && (
                  <div className="glass-panel p-5 rounded-3xl flex flex-col gap-3 md:col-span-2 text-left">
                    <h3 className="text-sm font-bold text-[#b4befe] uppercase tracking-wider border-b border-overlay/10 pb-2">
                      💡 General Themes & Goals
                    </h3>
                    <ul className="flex flex-col gap-2.5 max-h-60 overflow-y-auto pr-1">
                      {knowledgeBase.others.map((theme, index) => (
                        <li key={index} className="text-xs text-text/90 leading-relaxed flex items-start gap-2">
                          <span className="text-hype shrink-0">•</span>
                          <span>{theme}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 bg-surface/30 border border-overlay/10 border-dashed rounded-3xl text-center gap-3">
                <span className="text-3xl">🧠</span>
                <p className="text-xs text-text font-bold">No Compiled Knowledge Base</p>
                <p className="text-[11px] text-overlay max-w-sm">
                  Click the compile button to analyze your journal entries and build a centralized directory of key facts, growth milestones, and scenarios.
                </p>
                <button
                  disabled={isUpdatingKb}
                  onClick={generateKnowledgeBase}
                  className="px-5 py-2.5 rounded-xl bg-hype text-crust font-bold text-xs hover:bg-hype/90 transition-transform active:scale-95 cursor-pointer mt-2"
                >
                  {isUpdatingKb ? "Compiling..." : "Build Knowledge Base"}
                </button>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Floating Action Recording Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsRecorderOpen(true)}
          className="w-16 h-16 rounded-full bg-gradient-to-tr from-hype to-calm text-crust flex items-center justify-center shadow-lg shadow-hype/30 cursor-pointer"
        >
          <Mic className="w-7 h-7 fill-crust" />
        </motion.button>
      </div>

      {/* Batch Re-analysis Profile Selector Modal */}
      <AnimatePresence>
        {isBatchReanalyzePopupOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-crust/85 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-hype/20 flex flex-col gap-4 text-left shadow-xl"
            >
              <div className="flex justify-between items-center border-b border-surface pb-2">
                <h3 className="text-sm font-bold text-text flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-hype" />
                  <span>Choose Profile for Batch Re-analysis</span>
                </h3>
                <button
                  onClick={() => setIsBatchReanalyzePopupOpen(false)}
                  className="text-overlay hover:text-text cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-overlay uppercase">Profile Target</label>
                <select
                  value={selectedBatchProfileName}
                  onChange={(e) => setSelectedBatchProfileName(e.target.value)}
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
                  onClick={() => setIsBatchReanalyzePopupOpen(false)}
                  className="px-4 py-2 rounded-xl bg-crust hover:bg-surface text-xs font-semibold text-overlay cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => startBatchReanalysis(selectedBatchProfileName || "Default Profile")}
                  className="px-4 py-2 rounded-xl bg-hype text-crust text-xs font-bold hover:bg-hype/90 cursor-pointer shadow-md"
                >
                  Run Batch Re-analysis
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Breathing Recorder Overlay */}
      <BreathingRecorder
        isOpen={isRecorderOpen}
        onClose={() => setIsRecorderOpen(false)}
        onSuccess={() => fetchLogs()}
        removeFillerWords={removeFillerWords}
        enableSwearWords={enableSwearWords}
        customPrompt={customPrompt}
        language={language}
        customMoods={customMoods}
        categoriesConfig={categoriesConfig}
        tagsConfig={tagsConfig}
        onRegisterTags={registerNewCategoryAndTags}
      />
      {/* Floating Action Button (FAB) for accessible daily journaling */}
      <button
        onClick={() => setIsQuickJournalOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-5 py-3.5 rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-sky-500 text-white font-bold text-sm shadow-2xl hover:scale-105 transition-transform duration-300 cursor-pointer border border-purple-400/40"
        style={{
          boxShadow: "0 10px 30px -5px rgba(147, 51, 234, 0.5)",
        }}
      >
        <Edit3 className="w-5 h-5 animate-bounce" />
        <span>Daily & Quick Journal</span>
      </button>

      {/* Quick Accessible Daily Journal Modal */}
      <QuickJournalModal
        isOpen={isQuickJournalOpen}
        onClose={() => setIsQuickJournalOpen(false)}
        onSuccess={() => fetchLogs()}
      />

      {/* Interactive AI Chat Drawer for selected entry */}
      {selectedChatLog && (
        <JournalAIChatDrawer
          isOpen={!!selectedChatLog}
          onClose={() => setSelectedChatLog(null)}
          journalTitle={selectedChatLog.ai_title || "Journal Entry"}
          journalText={selectedChatLog.tidied_log || selectedChatLog.raw_transcript}
          reflections={selectedChatLog.reflections}
          journalId={selectedChatLog.id}
          provider={chatProvider}
          apiKey={chatApiKey}
          model={chatModel}
        />
      )}

      {/* Database & Storage Usage Modal */}
      <DatabaseUsageModal
        isOpen={isDbUsageModalOpen}
        onClose={() => setIsDbUsageModalOpen(false)}
        onMigrationComplete={() => fetchLogs()}
      />
    </div>
  );
}
