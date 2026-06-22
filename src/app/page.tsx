"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mic, Search, LogOut, Loader2, Sparkles, Filter, 
  Trash2, ShieldCheck, ChevronRight, Calendar, Info,
  Settings, ArrowUp, ArrowDown, SlidersHorizontal, X
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import YapHeatmap from "@/components/YapHeatmap";
import BreathingRecorder from "@/components/BreathingRecorder";

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

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingPending, setIsProcessingPending] = useState(false);

  // Settings states
  const [removeFillerWords, setRemoveFillerWords] = useState(true);
  const [enableSwearWords, setEnableSwearWords] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Sorting and rearranging states
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | 'size-desc' | 'size-asc' | 'custom'>('date-desc');
  const [isRearranging, setIsRearranging] = useState(false);
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  // Initialize offline sync hook
  const { isOnline } = useOfflineSync(() => fetchLogs());

  // Check user session on mount
  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUser(session.user);
      }
      setIsLoading(false);
    }
    checkAuth();
  }, []);

  // Load settings and custom order from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("yapsite_settings");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setRemoveFillerWords(parsed.removeFillerWords ?? true);
          setEnableSwearWords(parsed.enableSwearWords ?? false);
          setCustomPrompt(parsed.customPrompt ?? "");
        } catch (e) {
          console.error("Failed to parse settings", e);
        }
      }

      const savedOrder = localStorage.getItem("yapsite_custom_order");
      if (savedOrder) {
        try {
          setCustomOrder(JSON.parse(savedOrder));
        } catch (e) {
          console.error("Failed to parse custom order", e);
        }
      }
    }
  }, []);

  // Fetch journal entries once user state is confirmed
  useEffect(() => {
    if (user) {
      fetchLogs();
    }
  }, [user]);

  // Silent background processing of pending entries on load
  useEffect(() => {
    if (logs.length > 0 && !isProcessingPending && isOnline) {
      processPendingLogs();
    }
  }, [logs, isOnline]);

  const fetchLogs = async () => {
    if (!user) return;

    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("journal_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error("Error fetching logs:", err);
      toast.error("Failed to load journal logs.");
    }
  };

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
            customPrompt
          }),
        });

        if (res.ok) {
          const processed = await res.json();
          // Trigger browser notification
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification("YapSite Journal Processed", {
              body: `"${processed.ai_title || "Untitled"}" is ready!`,
              icon: "/favicon.ico"
            });
          }
          toast.success(`Background audio processing complete: "${processed.ai_title}"`);
          fetchLogs();
        }
      } catch (err) {
        console.error("Silent sync failed for", log.id, err);
      }
    }
    setIsProcessingPending(false);
  };

  // Auth logins
  const handleGitHubLogin = async () => {
    const supabase = createClient();
    try {
      await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    } catch (err) {
      toast.error("OAuth registration failed.");
    }
  };

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    } catch (err) {
      toast.error("OAuth registration failed.");
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setLogs([]);
    router.push("/");
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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-base">
        <Loader2 className="w-8 h-8 text-hype animate-spin" />
      </div>
    );
  }

  // Welcome Screen (Unauthenticated)
  if (!user) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-base p-6 relative overflow-hidden">
        {/* Soft decorative background glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-hype/10 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-calm/10 blur-3xl" />

        <div className="w-full max-w-md text-center z-10">
          {/* Logo Icon */}
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
              className="w-full py-3.5 px-6 rounded-2xl bg-surface hover:bg-surface/80 border border-overlay/10 text-text font-medium flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer"
            >
              Sign In with GitHub
            </button>
            <button
              onClick={handleGoogleLogin}
              className="w-full py-3.5 px-6 rounded-2xl bg-surface hover:bg-surface/80 border border-overlay/10 text-text font-medium flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer"
            >
              Sign In with Google
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-crust/80 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-lg glass-panel p-6 rounded-3xl border border-hype/20 flex flex-col gap-5 shadow-xl"
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

              {/* Toggles */}
              <div className="flex flex-col gap-4">
                <label className="flex items-center justify-between p-3 rounded-2xl bg-crust border border-surface cursor-pointer select-none">
                  <div className="flex flex-col gap-0.5 pr-2">
                    <span className="text-xs font-bold text-text">Remove Filler Words</span>
                    <span className="text-[10px] text-overlay">Strips 'um', 'uh', 'like', 'you know' from transcript</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={removeFillerWords}
                    onChange={(e) => {
                      setRemoveFillerWords(e.target.checked);
                      localStorage.setItem("yapsite_settings", JSON.stringify({
                        removeFillerWords: e.target.checked,
                        enableSwearWords,
                        customPrompt
                      }));
                    }}
                    className="w-5 h-5 rounded border-overlay/30 bg-surface accent-hype cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-2xl bg-crust border border-surface cursor-pointer select-none">
                  <div className="flex flex-col gap-0.5 pr-2">
                    <span className="text-xs font-bold text-text">Enable Swear Words</span>
                    <span className="text-[10px] text-overlay">Retain curse words in transcript and tidied thoughts</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableSwearWords}
                    onChange={(e) => {
                      setEnableSwearWords(e.target.checked);
                      localStorage.setItem("yapsite_settings", JSON.stringify({
                        removeFillerWords,
                        enableSwearWords: e.target.checked,
                        customPrompt
                      }));
                    }}
                    className="w-5 h-5 rounded border-overlay/30 bg-surface accent-hype cursor-pointer"
                  />
                </label>

                {/* Custom System Prompt Instructions */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-text">Custom AI Prompt Instructions</label>
                    <button
                      onClick={() => {
                        const defaultPrompt = "";
                        setCustomPrompt(defaultPrompt);
                        localStorage.setItem("yapsite_settings", JSON.stringify({
                          removeFillerWords,
                          enableSwearWords,
                          customPrompt: defaultPrompt
                        }));
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
                    onChange={(e) => {
                      setCustomPrompt(e.target.value);
                      localStorage.setItem("yapsite_settings", JSON.stringify({
                        removeFillerWords,
                        enableSwearWords,
                        customPrompt: e.target.value
                      }));
                    }}
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

      {/* Main Content (Responsive Laptop / Mobile Canvas) */}
      <main className="max-w-4xl mx-auto px-4 mt-6 flex flex-col gap-6">
        {/* Heatmap Grid */}
        <YapHeatmap logs={logs} />

        {/* Search and Filters */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-overlay" />
            <input
              type="text"
              placeholder="Search title, content, or tags..."
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
            <button
              onClick={() => setSelectedMood("#f38ba8")}
              className={`text-xs px-3.5 py-2 rounded-full border shrink-0 flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                selectedMood === "#f38ba8"
                  ? "bg-stressed text-crust border-stressed font-semibold"
                  : "bg-surface text-text border-overlay/10"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-stressed" /> Stressed
            </button>
            <button
              onClick={() => setSelectedMood("#74c7ec")}
              className={`text-xs px-3.5 py-2 rounded-full border shrink-0 flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                selectedMood === "#74c7ec"
                  ? "bg-calm text-crust border-calm font-semibold"
                  : "bg-surface text-text border-overlay/10"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-calm" /> Calm
            </button>
            <button
              onClick={() => setSelectedMood("#a6e3a1")}
              className={`text-xs px-3.5 py-2 rounded-full border shrink-0 flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                selectedMood === "#a6e3a1"
                  ? "bg-productive text-crust border-productive font-semibold"
                  : "bg-surface text-text border-overlay/10"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-productive" /> Focused
            </button>
            <button
              onClick={() => setSelectedMood("#cba6f7")}
              className={`text-xs px-3.5 py-2 rounded-full border shrink-0 flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                selectedMood === "#cba6f7"
                  ? "bg-hype text-crust border-hype font-semibold"
                  : "bg-surface text-text border-overlay/10"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-hype" /> Excited
            </button>
            <button
              onClick={() => setSelectedMood("#89b4fa")}
              className={`text-xs px-3.5 py-2 rounded-full border shrink-0 flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                selectedMood === "#89b4fa"
                  ? "bg-sky-500 text-crust border-sky-500 font-semibold"
                  : "bg-surface text-text border-overlay/10"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[rgba(137,180,250,1)]" /> Sad
            </button>
            <button
              onClick={() => setSelectedMood("#fab387")}
              className={`text-xs px-3.5 py-2 rounded-full border shrink-0 flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                selectedMood === "#fab387"
                  ? "bg-orange-400 text-crust border-orange-400 font-semibold"
                  : "bg-surface text-text border-overlay/10"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[rgba(250,179,135,1)]" /> Tired
            </button>
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

        {/* Logs List Container (Responsive Grid: 1 col on mobile, 2 cols on laptop) */}
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
                    className="w-full relative overflow-hidden rounded-3xl p-5 cursor-pointer glass-panel glass-panel-hover flex flex-col gap-3 group"
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
                            <Calendar className="w-3 h-3" />
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
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {log.ai_tags?.map((tag, tIdx) => (
                        <span
                          key={tIdx}
                          className="text-[10px] px-2.5 py-0.5 rounded-full bg-crust text-text/70 border border-surface"
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
      </main>

      {/* Floating Action Recording Button (Repositioned to bottom-right) */}
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

      {/* Breathing Recorder Overlay */}
      <BreathingRecorder
        isOpen={isRecorderOpen}
        onClose={() => setIsRecorderOpen(false)}
        onSuccess={() => fetchLogs()}
      />
    </div>
  );
}
