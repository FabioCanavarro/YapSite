"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Calendar, Clock, Sparkles, MessageSquare, Tag, ChevronRight,
  Smile, ShieldCheck, CheckCircle
} from "lucide-react";
import Link from "next/link";
import MarkdownRenderer from "./MarkdownRenderer";
import { animateCardHover } from "@/utils/gsapAnimations";

interface DailyJournalCardProps {
  log: {
    id: string;
    ai_title: string;
    ai_mood_color: string;
    raw_transcript: string;
    tidied_log: string;
    ai_tags: string[];
    custom_tags: string[];
    reflections?: string | null;
    created_at: string;
    audio_url?: string;
  };
  onOpenChat?: (log: any) => void;
}

export default function DailyJournalCard({ log, onOpenChat }: DailyJournalCardProps) {
  const [showRaw, setShowRaw] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const moodColor = log.ai_mood_color || "#74c7ec";
  const dateFormatted = new Date(log.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeFormatted = new Date(log.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const categoryTag = log.custom_tags?.find((t) => t.startsWith("_category:"));
  const categoryName = categoryTag ? categoryTag.replace("_category:", "") : "General";
  
  const isDaily = log.audio_url === "daily_journal" || categoryName === "Daily Reflection";
  const isPastHours = log.audio_url === "past_hours_journal" || categoryName === "Past Hours";

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => animateCardHover(cardRef.current, true)}
      onMouseLeave={() => animateCardHover(cardRef.current, false)}
      className="gsap-card group relative bg-slate-900/80 backdrop-blur-md border border-slate-800 hover:border-purple-500/50 rounded-2xl p-5 flex flex-col justify-between transition-colors shadow-lg overflow-hidden"
    >
      {/* Top mood color accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-1 transition-all duration-300 group-hover:h-1.5"
        style={{ backgroundColor: moodColor }}
      />

      <div>
        {/* Header Badges */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-medium border"
              style={{
                backgroundColor: `${moodColor}15`,
                borderColor: `${moodColor}40`,
                color: moodColor,
              }}
            >
              {categoryName}
            </span>

            {isDaily && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1 font-semibold">
                <Calendar className="w-3 h-3" /> Daily
              </span>
            )}
            {isPastHours && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1 font-semibold">
                <Clock className="w-3 h-3" /> On-the-spot
              </span>
            )}
          </div>

          <span className="text-xs text-slate-400 font-mono">
            {dateFormatted} · {timeFormatted}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-slate-100 group-hover:text-purple-300 transition line-clamp-2 mb-2">
          {log.ai_title || "Untitled Journal Entry"}
        </h3>

        {/* Tidied / Raw Text Preview */}
        <div className="text-xs text-slate-300 line-clamp-3 leading-relaxed mb-4">
          <MarkdownRenderer content={showRaw ? log.raw_transcript : log.tidied_log || log.raw_transcript} />
        </div>
      </div>

      {/* Footer Controls & Tags */}
      <div className="pt-3 border-t border-slate-800/80 space-y-3">
        {/* Tags */}
        {log.ai_tags && log.ai_tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {log.ai_tags.slice(0, 3).map((tag, idx) => (
              <span
                key={idx}
                className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400 border border-slate-700/50"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition border border-slate-700/50"
            >
              {showRaw ? "Show Cleaned Up" : "Show Raw"}
            </button>

            {onOpenChat && (
              <button
                onClick={() => onOpenChat(log)}
                className="text-[11px] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-500/40 transition"
              >
                <MessageSquare className="w-3 h-3" /> Chat
              </button>
            )}
          </div>

          <Link
            href={`/journal/${log.id}`}
            className="text-xs flex items-center gap-1 text-purple-400 hover:text-purple-300 font-medium transition"
          >
            Open Entry <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
