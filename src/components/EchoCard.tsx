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
  const [echoLogs, setEchoLogs] = useState<Log[]>([]);
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
          .neq("id", currentLogId)
          .neq("processing_status", "settings_profile")
          .neq("processing_status", "knowledge_base");

        // Build OR query filters
        const orConditions: string[] = [];
        if (moodColor) {
          orConditions.push(`ai_mood_color.eq."${moodColor}"`);
        }
        if (tags && tags.length > 0) {
          const formattedTags = tags.map((t) => `"${t}"`).join(",");
          orConditions.push(`ai_tags.ov.{${formattedTags}}`);
        }

        if (orConditions.length > 0) {
          query = query.or(orConditions.join(","));
        }

        const { data: logs, error } = await query.limit(50);

        if (error) throw error;

        if (logs && logs.length > 0) {
          const typedLogs = logs as Log[];
          const sorted = [...typedLogs].sort((a, b) => {
            const aHasRef = a.reflections && a.reflections.trim() ? 1 : 0;
            const bHasRef = b.reflections && b.reflections.trim() ? 1 : 0;

            if (aHasRef !== bHasRef) {
              return bHasRef - aHasRef;
            }

            const aOverlap = a.ai_tags?.filter((t) => tags.includes(t)).length || 0;
            const bOverlap = b.ai_tags?.filter((t) => tags.includes(t)).length || 0;
            if (aOverlap !== bOverlap) {
              return bOverlap - aOverlap;
            }

            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });

          // Fetch top 3 matches
          setEchoLogs(sorted.slice(0, 3));
        } else {
          setEchoLogs([]);
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
      <div className="w-full glass-panel rounded-3xl p-6 animate-pulse flex flex-col gap-3">
        <div className="h-4 w-1/3 bg-surface rounded" />
        <div className="h-20 bg-surface rounded" />
      </div>
    );
  }

  if (echoLogs.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex items-center gap-2 text-hype font-bold text-xs tracking-wider uppercase pl-1">
        <Sparkles className="w-4 h-4 animate-pulse" />
        <span>Echoes from the Past</span>
      </div>

      <div className="flex flex-col gap-4">
        {echoLogs.map((echoLog) => {
          const dateStr = new Date(echoLog.created_at).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          });

          // Calculate overlaps
          const overlapTags = echoLog.ai_tags?.filter((t) => tags.includes(t)) || [];
          const sameMood = echoLog.ai_mood_color === moodColor;

          // CSS properties for glows
          const style = {
            "--glow-color": echoLog.ai_mood_color + "40",
            "--border-color": echoLog.ai_mood_color + "20",
            borderLeft: `4px solid ${echoLog.ai_mood_color}`,
          } as React.CSSProperties;

          return (
            <motion.div
              key={echoLog.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full relative overflow-hidden rounded-3xl glass-panel p-5 glowing-border-active flex flex-col gap-2.5 transition-all duration-300"
              style={style}
            >
              {/* Decorative mood-colored glow */}
              <div
                className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20 pointer-events-none"
                style={{ backgroundColor: echoLog.ai_mood_color }}
              />

              <div className="flex justify-between items-start gap-4">
                <div>
                  <h4 className="text-md font-bold text-text mb-0.5 leading-snug">
                    {echoLog.ai_title || "Untitled Echo"}
                  </h4>
                  <div className="flex items-center gap-1.5 text-overlay text-[10px]">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{dateStr}</span>
                  </div>
                </div>

                {/* Overlap tags badge */}
                <div className="flex flex-wrap gap-1 items-center shrink-0">
                  {sameMood && (
                    <span className="text-[9px] bg-productive/25 text-productive border border-productive/20 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                      Mood Harmony
                    </span>
                  )}
                  {overlapTags.length > 0 && (
                    <span className="text-[9px] bg-hype/25 text-hype border border-hype/20 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                      {overlapTags.length} Shared Tag{overlapTags.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* Excerpt of the log */}
              <div className="text-xs text-text/80 line-clamp-2 italic pl-3 border-l border-overlay/20 relative my-1">
                <Quote className="w-5 h-5 text-overlay/5 absolute -left-1 -top-2.5 scale-y-[-1]" />
                {echoLog.tidied_log}
              </div>

              {/* Reflections summary if any */}
              {echoLog.reflections && (
                <div className="p-2.5 rounded-xl bg-crust/50 border border-surface/50 text-[11px] leading-normal">
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-overlay mb-0.5">
                    Retro Reflections
                  </p>
                  <p className="text-text/90 line-clamp-1">{echoLog.reflections}</p>
                </div>
              )}

              <div className="flex justify-between items-center mt-1 pt-1 border-t border-surface/30">
                {/* Overlap tag names */}
                <div className="flex gap-1 overflow-x-auto scrollbar-none pr-4">
                  {overlapTags.map((tag, idx) => (
                    <span key={idx} className="text-[9px] text-hype font-medium">
                      #{tag}
                    </span>
                  ))}
                </div>

                <Link
                  href={`/journal/${echoLog.id}`}
                  className="group flex items-center gap-1.5 text-[10px] font-bold text-text hover:text-hype transition-colors shrink-0"
                >
                  <span>Revisit Entry</span>
                  <ArrowRight className="w-3 h-3 transform group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
