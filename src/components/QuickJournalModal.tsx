"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, Edit3, Sparkles, Save, X, Smile,
  CheckCircle2, Wand2, RefreshCw, AlignLeft, ShieldCheck, Play
} from "lucide-react";
import { toast } from "sonner";
import { animateModalEnter, animateModalExit, animateThemeChange } from "@/utils/gsapAnimations";
import MarkdownRenderer from "./MarkdownRenderer";

interface QuickJournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newLog?: any) => void;
}

export default function QuickJournalModal({
  isOpen,
  onClose,
  onSuccess,
}: QuickJournalModalProps) {
  const [activeTab, setActiveTab] = useState<"daily" | "past_hours" | "general">("daily");
  const [timeWindow, setTimeWindow] = useState("Last 3 Hours");
  const [rawText, setRawText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMoodColor, setSelectedMoodColor] = useState("#74c7ec");
  const [previewTidied, setPreviewTidied] = useState<string | null>(null);
  const [previewReview, setPreviewReview] = useState<string | null>(null);
  const [aiTitle, setAiTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState("Daily Reflection");
  
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const moodOptions = [
    { name: "Calm", color: "#74c7ec", icon: "🌊" },
    { name: "Focused", color: "#a6e3a1", icon: "🎯" },
    { name: "Excited", color: "#cba6f7", icon: "⚡" },
    { name: "Stressed", color: "#f38ba8", icon: "🔥" },
    { name: "Sad", color: "#89b4fa", icon: "🌧️" },
    { name: "Tired", color: "#fab387", icon: "☕" },
  ];

  const dailyPrompts = [
    "What went well today?",
    "What gave me energy or made me smile?",
    "What challenged me today and how did I handle it?",
    "What am I grateful for right now?"
  ];

  const pastHoursPresets = [
    { label: "Last 1 Hour", code: "1h", prompt: "What happened in the past 1 hour?" },
    { label: "Last 3 Hours", code: "3h", prompt: "Recap of the last 3 hours..." },
    { label: "Last 6 Hours", code: "6h", prompt: "Overview of my work & mood over the past 6 hours:" },
    { label: "On the Spot Check-in", code: "spot", prompt: "Quick check-in right now on the spot:" },
  ];

  useEffect(() => {
    if (isOpen) {
      if (modalRef.current) {
        animateModalEnter(modalRef.current, backdropRef.current);
      }
    } else {
      setRawText("");
      setPreviewTidied(null);
      setPreviewReview(null);
    }
  }, [isOpen]);

  const handleSelectTab = (tab: "daily" | "past_hours" | "general") => {
    setActiveTab(tab);
    if (tab === "daily" && !rawText) {
      setRawText("Today's Reflection:\n- ");
      setCategory("Daily Reflection");
    } else if (tab === "past_hours" && !rawText) {
      setRawText(`[On-The-Spot Journal - ${timeWindow}]\n- `);
      setCategory("Past Hours");
    } else if (tab === "general" && !rawText) {
      setRawText("");
      setCategory("Personal");
    }
  };

  const handleMoodSelect = (color: string, event: React.MouseEvent) => {
    setSelectedMoodColor(color);
    if (modalRef.current) {
      animateThemeChange(modalRef.current, `${color}15`, event);
    }
  };

  const handleInsertPrompt = (promptText: string) => {
    setRawText((prev) => (prev ? `${prev}\n\n${promptText}\n- ` : `${promptText}\n- `));
  };

  const handleAICleanUpAndAnalyze = async () => {
    if (!rawText.trim()) {
      toast.error("Please write something before running AI Clean Up & Analysis!");
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading("AI is tidying your text, analyzing mood, and writing review...");

    try {
      const res = await fetch("/api/process-text-journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: rawText,
          entryType: activeTab,
          timeWindow,
          customMoods: moodOptions,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to process text journal");
      }

      const data = await res.json();
      setPreviewTidied(data.tidied_log);
      setPreviewReview(data.reflections);
      setAiTitle(data.ai_title);
      setSelectedMoodColor(data.ai_mood_color || selectedMoodColor);
      setTags(data.ai_tags || []);
      
      const catTag = data.custom_tags?.find((t: string) => t.startsWith("_category:"));
      if (catTag) {
        setCategory(catTag.replace("_category:", ""));
      }

      toast.success("AI Clean Up, Mood Analysis & Review complete!", { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to analyze journal text.", { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveJournal = async () => {
    if (!rawText.trim()) {
      toast.error("Journal entry cannot be empty!");
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading("Saving journal entry...");

    try {
      const res = await fetch("/api/process-text-journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: rawText,
          entryType: activeTab,
          timeWindow,
          customMoods: moodOptions,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save journal");
      }

      const savedLog = await res.json();
      toast.success("Journal entry saved successfully!", { id: toastId });
      
      animateModalExit(modalRef.current, backdropRef.current, () => {
        onSuccess(savedLog);
        onClose();
      });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save journal entry.", { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity"
      />

      {/* Modal Card */}
      <div
        ref={modalRef}
        className="relative w-full max-w-3xl max-h-[90vh] bg-slate-950/95 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden z-10"
        style={{
          boxShadow: `0 0 40px ${selectedMoodColor}20`,
        }}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div
              className="p-2.5 rounded-2xl transition-colors duration-500"
              style={{ backgroundColor: `${selectedMoodColor}25`, color: selectedMoodColor }}
            >
              <Edit3 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-slate-100 flex items-center gap-2">
                Quick Journaling
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium">
                  Accessible
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Write on the spot, cleanup grammar, analyze mood & get AI review
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="p-3 bg-slate-900/40 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5 bg-slate-900 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => handleSelectTab("daily")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs md:text-sm font-medium transition ${
                activeTab === "daily"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-900/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Calendar className="w-4 h-4" />
              Daily Journal
            </button>

            <button
              onClick={() => handleSelectTab("past_hours")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs md:text-sm font-medium transition ${
                activeTab === "past_hours"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-900/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Clock className="w-4 h-4" />
              Past Few Hours
            </button>

            <button
              onClick={() => handleSelectTab("general")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs md:text-sm font-medium transition ${
                activeTab === "general"
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <AlignLeft className="w-4 h-4" />
              Free Typing
            </button>
          </div>

          {/* Word count badge */}
          <div className="text-xs text-slate-400 px-3 py-1 bg-slate-900/80 rounded-lg border border-slate-800">
            {rawText.trim() ? rawText.trim().split(/\s+/).length : 0} words
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Past hours preset chips if past_hours tab selected */}
          {activeTab === "past_hours" && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Select Time Window ("On the Spot"):
              </label>
              <div className="flex flex-wrap gap-2">
                {pastHoursPresets.map((preset) => (
                  <button
                    key={preset.code}
                    onClick={() => {
                      setTimeWindow(preset.label);
                      if (!rawText.includes(preset.label)) {
                        setRawText(`[On-The-Spot Journal - ${preset.label}]\n${preset.prompt}\n- `);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs border transition ${
                      timeWindow === preset.label
                        ? "bg-sky-500/20 border-sky-500 text-sky-300 font-semibold"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    ⚡ {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Prompts Helper */}
          {activeTab === "daily" && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Daily Reflection Ideas:
              </label>
              <div className="flex flex-wrap gap-2">
                {dailyPrompts.map((promptText, i) => (
                  <button
                    key={i}
                    onClick={() => handleInsertPrompt(promptText)}
                    className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
                  >
                    + {promptText}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Text Area Input */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Your Thoughts (Type freely):
              </label>
              {aiTitle && (
                <span className="text-xs font-medium text-purple-400 truncate max-w-xs">
                  ✨ Title: "{aiTitle}"
                </span>
              )}
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={
                activeTab === "daily"
                  ? "Write down your daily recap, achievements, challenges, or thoughts..."
                  : activeTab === "past_hours"
                  ? "What happened in the past few hours? Journal on the spot..."
                  : "Type anything on your mind..."
              }
              rows={6}
              className="w-full bg-slate-900/90 border border-slate-800 focus:border-purple-500 rounded-2xl p-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition resize-none leading-relaxed"
            />
          </div>

          {/* Mood Color Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Smile className="w-3.5 h-3.5 text-purple-400" />
              Emotional Tone / Mood Color:
            </label>
            <div className="flex flex-wrap gap-2">
              {moodOptions.map((m) => (
                <button
                  key={m.name}
                  onClick={(e) => handleMoodSelect(m.color, e)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border transition ${
                    selectedMoodColor === m.color
                      ? "ring-2 ring-purple-400 font-semibold"
                      : "opacity-75 hover:opacity-100"
                  }`}
                  style={{
                    backgroundColor: `${m.color}20`,
                    borderColor: `${m.color}60`,
                    color: m.color,
                  }}
                >
                  <span>{m.icon}</span>
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Live AI Clean Up Preview (if generated) */}
          {previewTidied && (
            <div className="bg-slate-900/80 border border-purple-900/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  AI Tidied & Cleaned Up Journal:
                </h4>
                <button
                  onClick={() => setRawText(previewTidied)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 transition"
                >
                  Apply Clean Up to Text
                </button>
              </div>
              <div className="text-sm text-slate-200 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <MarkdownRenderer content={previewTidied} />
              </div>
            </div>
          )}

          {/* Live AI Review Preview (if generated) */}
          {previewReview && (
            <div className="bg-purple-950/20 border border-purple-900/30 rounded-2xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-purple-400" />
                AI Psychological Review & Insights:
              </h4>
              <div className="text-sm text-purple-100/90 bg-slate-950/60 p-3.5 rounded-xl border border-purple-900/30">
                <MarkdownRenderer content={previewReview} />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
          {/* AI Clean Up Action */}
          <button
            onClick={handleAICleanUpAndAnalyze}
            disabled={isProcessing || !rawText.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-500/40 font-medium text-xs md:text-sm transition disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-purple-400 animate-spin" />
            AI Clean Up & Mood Review
          </button>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs md:text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveJournal}
              disabled={isProcessing || !rawText.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs md:text-sm shadow-lg shadow-purple-900/40 transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Save Journal Entry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
