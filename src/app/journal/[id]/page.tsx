"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
  ArrowLeft, Volume2, VolumeX, FileText, Check, 
  Save, Heart, Calendar, Loader2, Sparkles 
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import EchoCard from "@/components/EchoCard";

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
  const [audioPlaybackUrl, setAudioPlaybackUrl] = useState("");

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

        // Generate a secure signed URL for private audio playbacks
        if (data.audio_url) {
          try {
            const urlObj = new URL(data.audio_url);
            const pathParts = urlObj.pathname.split("/audio_journals/");
            const storagePath = pathParts.length >= 2 ? decodeURIComponent(pathParts[1]) : "";
            
            if (storagePath) {
              const { data: signedData, error: signedError } = await supabase.storage
                .from("audio_journals")
                .createSignedUrl(storagePath, 3600); // 1 hour validation
              
              if (!signedError && signedData) {
                setAudioPlaybackUrl(signedData.signedUrl);
              } else {
                setAudioPlaybackUrl(data.audio_url);
              }
            } else {
              setAudioPlaybackUrl(data.audio_url);
            }
          } catch (urlErr) {
            console.error("Failed to generate signed playback URL:", urlErr);
            setAudioPlaybackUrl(data.audio_url);
          }
        }
      } catch (err) {
        console.error("Error fetching journal detail:", err);
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
      toast.success("Reading tidied journal aloud...");
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
      toast.success("Reflections vault updated!");
    } catch (err) {
      console.error("Error saving reflections:", err);
      toast.error("Failed to update reflections.");
    } finally {
      setIsSavingReflections(false);
    }
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
      <div className="flex-1 flex items-center justify-center bg-base">
        <Loader2 className="w-8 h-8 text-hype animate-spin" />
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
          
          <button
            onClick={handleObsidianExport}
            className="px-3.5 py-1.5 rounded-full bg-surface hover:bg-surface-hover border border-overlay/10 text-xs font-semibold text-text flex items-center gap-1.5 transition-transform duration-200 active:scale-95 shadow-md cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Obsidian Export</span>
          </button>
        </div>
      </header>

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

          <span className="text-[10px] text-overlay font-light uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Calendar className="w-3.5 h-3.5" />
            {dateStr}
          </span>

          <h2 className="text-2xl font-extrabold tracking-tight text-text leading-snug mb-3">
            {log.ai_title || "Untitled Entry"}
          </h2>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {log.ai_tags?.map((tag, idx) => (
              <span
                key={idx}
                className="text-[10px] px-2.5 py-0.5 rounded-full bg-surface text-text/80 font-medium"
              >
                #{tag}
              </span>
            ))}
          </div>

          {/* Audio Player if URL available */}
          {audioPlaybackUrl && (
            <div className="w-full mt-4 p-2 rounded-2xl bg-crust border border-surface/50">
              <audio src={audioPlaybackUrl} controls className="w-full h-10 accent-hype opacity-90" />
            </div>
          )}
        </motion.div>

        {/* Tidied Thoughts Block */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="w-full rounded-3xl p-6 glass-panel flex flex-col gap-4"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-semibold tracking-wider text-overlay uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-hype" />
              Tidied Thoughts
            </h3>
            
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

          <div className="text-md text-text/90 leading-relaxed font-sans tracking-wide whitespace-pre-wrap">
            {log.tidied_log || "No transcription content available."}
          </div>
        </motion.div>

        {/* Raw Voice Transcript (Expandable) */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full rounded-3xl p-6 glass-panel flex flex-col gap-3"
        >
          <h3 className="text-xs font-semibold tracking-wider text-overlay uppercase">
            Raw Speech Transcript
          </h3>
          <div className="text-sm text-overlay leading-relaxed italic whitespace-pre-wrap pl-3 border-l border-surface">
            "{log.raw_transcript || "Empty transcript data."}"
          </div>
        </motion.div>

        {/* Therapist Vault / Reflections */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full rounded-3xl p-6 glass-panel flex flex-col gap-4 border border-hype/15"
        >
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-hype fill-hype" />
            <h3 className="text-xs font-semibold tracking-wider text-overlay uppercase">
              Therapist Vault & Reflections
            </h3>
          </div>

          <textarea
            placeholder="Write retroactive reflections here... What did you learn? How do you feel looking back?"
            value={reflections}
            onChange={(e) => setReflections(e.target.value)}
            rows={4}
            className="w-full p-4 bg-crust rounded-2xl border border-overlay/10 text-text placeholder-overlay focus:outline-none focus:border-hype/50 text-sm leading-relaxed resize-none"
          />

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSaveReflections}
            disabled={isSavingReflections}
            className="w-full py-3.5 px-6 rounded-2xl bg-hype text-crust font-bold flex items-center justify-center gap-2 transition-all duration-200 shadow-md cursor-pointer"
          >
            {isSavingReflections ? (
              <Loader2 className="w-4 h-4 animate-spin text-crust" />
            ) : (
              <Save className="w-4 h-4 fill-crust" />
            )}
            <span>Save Reflection</span>
          </motion.button>
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
