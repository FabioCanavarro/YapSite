"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, X, Bot, User, RefreshCw, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import MarkdownRenderer from "./MarkdownRenderer";
import { animateModalEnter } from "@/utils/gsapAnimations";

interface JournalAIChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  journalTitle: string;
  journalText: string;
  reflections?: string | null;
  journalId?: string;
  provider?: string;
  apiKey?: string;
  model?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function JournalAIChatDrawer({
  isOpen,
  onClose,
  journalTitle,
  journalText,
  reflections,
  journalId,
  provider = "hackclub",
  apiKey = "",
  model = "",
}: JournalAIChatDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Suggested prompt chips
  const suggestedPrompts = [
    "What core emotional patterns do you notice in this entry?",
    "Suggest 3 practical action steps based on what I wrote.",
    "Give me positive affirmations tailored to this situation.",
    "Help me view this scenario from a different perspective."
  ];

  useEffect(() => {
    if (isOpen) {
      if (drawerRef.current) {
        animateModalEnter(drawerRef.current);
      }
      if (messages.length === 0) {
        setMessages([
          {
            role: "assistant",
            content: `Hi there! I've read your journal entry **"${journalTitle}"**. What would you like to explore or talk about regarding your thoughts today?`
          }
        ]);
      }
    }
  }, [isOpen, journalTitle]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || isLoading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    if (!textToSend) setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/journal-ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journalId,
          journalTitle,
          journalText,
          reflections,
          messages: newMessages,
          provider,
          apiKey,
          model,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to fetch response");
      }

      const data = await response.json();
      setMessages([...newMessages, { role: "assistant", content: data.text }]);
    } catch (err: any) {
      console.error("AI Chat error:", err);
      toast.error(err.message || "Failed to communicate with AI chat.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
        {/* Click outside backdrop */}
        <div className="absolute inset-0" onClick={onClose} />

        {/* Drawer Content */}
        <div
          ref={drawerRef}
          className="relative w-full max-w-lg h-full bg-slate-950/95 border-l border-slate-800 shadow-2xl flex flex-col z-10"
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60 backdrop-blur-md">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-sm md:text-base flex items-center gap-2">
                  AI Journal Chat
                </h3>
                <p className="text-xs text-slate-400 truncate max-w-[240px]">
                  Talking about: {journalTitle}
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

          {/* Prompt Suggestion Chips */}
          <div className="p-3 border-b border-slate-800/40 bg-slate-900/30 overflow-x-auto flex gap-2 no-scrollbar">
            {suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(prompt)}
                disabled={isLoading}
                className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-purple-900/40 border border-slate-700/60 hover:border-purple-500/40 text-slate-300 hover:text-purple-200 transition"
              >
                💡 {prompt}
              </button>
            ))}
          </div>

          {/* Messages List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs ${
                    msg.role === "user"
                      ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                      : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                  }`}
                >
                  {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div
                  className={`max-w-[82%] p-3.5 rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "bg-sky-600 text-white rounded-tr-none shadow-md"
                      : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none shadow-sm"
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-3 text-slate-400 text-xs py-2">
                <div className="shrink-0 w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Bot className="w-4 h-4 animate-spin" />
                </div>
                <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 px-3 py-2 rounded-2xl">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
                  <span>AI is thinking about your entry...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <div className="p-3 border-t border-slate-800/80 bg-slate-900/80 backdrop-blur-md">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask AI anything about your journal entry..."
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none transition"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="p-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white disabled:opacity-50 transition shadow-lg shadow-purple-900/30"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </AnimatePresence>
  );
}
