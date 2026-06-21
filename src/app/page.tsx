"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mic, Search, LogOut, Loader2, Sparkles, Filter, 
  Trash2, ShieldCheck, ChevronRight, Calendar, Info 
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
          body: JSON.stringify({ logId: log.id, removeFillerWords: true }),
        });

        if (res.ok) {
          toast.success("Silent background audio processing complete!");
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

  // Search & Filter computation
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch = 
        log.ai_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.tidied_log?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.ai_tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
        log.custom_tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesMood = selectedMood ? log.ai_mood_color === selectedMood : true;

      return matchesSearch && matchesMood;
    });
  }, [logs, searchQuery, selectedMood]);

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

                return (
                  <motion.div
                    key={log.id}
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
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-overlay font-light uppercase tracking-wider flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {dateStr}
                          </span>
                          {log.processing_status === "pending" && (
                            <span className="text-[9px] bg-hype/20 text-hype px-1.5 py-0.5 rounded font-mono animate-pulse">
                              Processing...
                            </span>
                          )}
                        </div>
                        <h3 className="text-md font-bold text-text group-hover:text-hype transition-colors duration-200 leading-snug">
                          {log.ai_title || "Untitled Entry"}
                        </h3>
                      </div>
                      
                      <button
                        onClick={(e) => deleteEntry(log.id, e)}
                        className="p-1.5 rounded-lg hover:bg-crust hover:text-stressed text-overlay transition-colors cursor-pointer"
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
