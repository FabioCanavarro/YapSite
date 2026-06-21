"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, Calendar, ArrowRight, Quote } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Log {
  id: string;
  ai_title: string;
  ai_mood_color: string;
  tidied_log: string;
  reflections: string | null;
  ai_tags: string[];
  created_at: string;
}

interface EchoCardProps {
  currentLogId: string;
  moodColor: string;
  tags: string[];
}

export default function EchoCard({ currentLogId, moodColor, tags }: EchoCardProps) {
  const [echoLog, setEchoLog] = useState<Log | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchEcho() {
      if (!currentLogId) return;

      setIsLoading(true);
      const supabase = createClient();

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        // Fetch logs that match the mood color OR overlap tags, excluding the current log
        let query = supabase
          .from("journal_logs")
          .select("*")
          .eq("user_id", user.id)
          .neq("id", currentLogId);

        // Build OR query filters
        const orConditions: string[] = [];
        if (moodColor) {
          // Wrap values in double quotes to escape special characters like '#'
          orConditions.push(`ai_mood_color.eq."${moodColor}"`);
        }
        if (tags && tags.length > 0) {
          const formattedTags = tags.map((t) => `"${t}"`).join(",");
          // PostgREST operator for array overlap inside an OR string is 'ov' (not 'overlaps')
          orConditions.push(`ai_tags.ov.{${formattedTags}}`);
        }

        if (orConditions.length > 0) {
          query = query.or(orConditions.join(","));
        }

        const { data: logs, error } = await query.limit(50);

        if (error) throw error;

        if (logs && logs.length > 0) {
          // Rank matches based on prioritizing logs with reflections, then tag overlap count, then age
          const typedLogs = logs as Log[];
          const sorted = [...typedLogs].sort((a, b) => {
            const aHasRef = a.reflections && a.reflections.trim() ? 1 : 0;
            const bHasRef = b.reflections && b.reflections.trim() ? 1 : 0;

            // Prioritize logs with reflections
            if (aHasRef !== bHasRef) {
              return bHasRef - aHasRef;
            }

            // Prioritize logs with higher overlap in tags
            const aOverlap = a.ai_tags?.filter((t) => tags.includes(t)).length || 0;
            const bOverlap = b.ai_tags?.filter((t) => tags.includes(t)).length || 0;
            if (aOverlap !== bOverlap) {
              return bOverlap - aOverlap;
            }

            // Fallback: newer logs first (or older, let's keep newer relative to the past logs)
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });

          setEchoLog(sorted[0]);
        } else {
          setEchoLog(null);
        }
      } catch (err) {
        console.error("Error fetching Echo logs:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchEcho();
  }, [currentLogId, moodColor, tags]);

  if (isLoading) {
    return (
      <div className="w-full glass-panel rounded-3xl p-6 animate-pulse">
        <div className="h-4 w-1/3 bg-surface rounded mb-3" />
        <div className="h-20 bg-surface rounded" />
      </div>
    );
  }

  if (!echoLog) return null;

  const dateStr = new Date(echoLog.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full relative overflow-hidden rounded-3xl glass-panel p-6 border-l-4"
      style={{ borderLeftColor: echoLog.ai_mood_color }}
    >
      {/* Decorative mood-colored glow */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ backgroundColor: echoLog.ai_mood_color }}
      />

      <div className="flex items-center gap-2 mb-3 text-hype font-semibold text-xs tracking-wider uppercase">
        <Sparkles className="w-4 h-4" />
        <span>Echo from the Past</span>
      </div>

      <div className="mb-4">
        <h4 className="text-lg font-bold text-text mb-1 leading-snug">
          {echoLog.ai_title || "Untitled Echo"}
        </h4>
        <div className="flex items-center gap-1.5 text-overlay text-xs">
          <Calendar className="w-3.5 h-3.5" />
          <span>{dateStr}</span>
        </div>
      </div>

      {/* Excerpt of the log */}
      <div className="text-sm text-text/80 line-clamp-3 italic mb-4 pl-4 border-l border-overlay/20 relative">
        <Quote className="w-6 h-6 text-overlay/10 absolute -left-1 -top-3 scale-y-[-1]" />
        {echoLog.tidied_log}
      </div>

      {/* Reflections summary if any */}
      {echoLog.reflections && (
        <div className="mb-5 p-3 rounded-2xl bg-crust/50 border border-surface/50">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-overlay mb-1">
            Retro Reflections
          </p>
          <p className="text-xs text-text/90 line-clamp-2">{echoLog.reflections}</p>
        </div>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {echoLog.ai_tags?.slice(0, 3).map((tag, idx) => (
          <span
            key={idx}
            className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-text/75 font-medium border border-surface-hover/20"
          >
            #{tag}
          </span>
        ))}
      </div>

      <Link href={`/journal/${echoLog.id}`} className="group flex items-center gap-2 text-xs font-semibold text-text hover:text-hype transition-colors duration-200">
        <span>Revisit this moment</span>
        <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
      </Link>
    </motion.div>
  );
}
