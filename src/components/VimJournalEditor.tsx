"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Maximize2, Minimize2, Terminal, Type, Sparkles, RefreshCw, Layers } from "lucide-react";

interface VimJournalEditorProps {
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
  label?: string;
  showVimToggle?: boolean;
  showFullscreenToggle?: boolean;
  showAutoResizeToggle?: boolean;
}

export default function VimJournalEditor({
  value,
  onChange,
  placeholder = "Write down your journal thoughts...",
  minRows = 6,
  className = "",
  label = "Journal Input",
  showVimToggle = true,
  showFullscreenToggle = true,
  showAutoResizeToggle = true,
}: VimJournalEditorProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isVimMode, setIsVimMode] = useState(false);
  const [vimState, setVimState] = useState<"NORMAL" | "INSERT">("INSERT");
  const [autoResize, setAutoResize] = useState(true);
  const [pendingCmd, setPendingCmd] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<string[]>([value]);
  const historyIndexRef = useRef<number>(0);

  // Auto-resize textarea logic
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (autoResize) {
      el.style.height = "auto";
      const newHeight = Math.max(minRows * 24, el.scrollHeight + 4);
      el.style.height = `${newHeight}px`;
    } else {
      el.style.height = `${minRows * 24}px`;
    }
  }, [autoResize, minRows]);

  useEffect(() => {
    adjustHeight();
  }, [value, autoResize, adjustHeight]);

  // Record undo history
  const pushHistory = (newVal: string) => {
    if (historyRef.current[historyIndexRef.current] !== newVal) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
      historyRef.current.push(newVal);
      historyIndexRef.current = historyRef.current.length - 1;
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    onChange(newVal);
    pushHistory(newVal);
  };

  // Handle Fullscreen ESC listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        if (!isVimMode || vimState === "NORMAL") {
          setIsFullscreen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, isVimMode, vimState]);

  // Vim Keyboard Navigation and Shortcuts
  const handleVimKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isVimMode) return;

    const el = textareaRef.current;
    if (!el) return;

    if (vimState === "INSERT") {
      if (e.key === "Escape") {
        e.preventDefault();
        setVimState("NORMAL");
        setPendingCmd("");
      }
      return;
    }

    // --- NORMAL MODE KEYBINDINGS ---
    e.preventDefault();
    const cursorPos = el.selectionStart;
    const text = value;

    // Helper: move cursor
    const moveCursor = (newPos: number) => {
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = Math.max(0, Math.min(text.length, newPos));
      }, 0);
    };

    // Helper: get current line bounds
    const getLineBounds = () => {
      const lineStart = text.lastIndexOf("\n", cursorPos - 1) + 1;
      let lineEnd = text.indexOf("\n", cursorPos);
      if (lineEnd === -1) lineEnd = text.length;
      return { lineStart, lineEnd };
    };

    if (pendingCmd === "d") {
      if (e.key === "d") {
        // 'dd': Delete line
        const { lineStart, lineEnd } = getLineBounds();
        const deleteEnd = lineEnd < text.length && text[lineEnd] === "\n" ? lineEnd + 1 : lineEnd;
        const newText = text.substring(0, lineStart) + text.substring(deleteEnd);
        onChange(newText);
        pushHistory(newText);
        moveCursor(lineStart);
        setPendingCmd("");
        return;
      } else {
        setPendingCmd("");
      }
    }

    switch (e.key) {
      case "i":
        setVimState("INSERT");
        break;
      case "a":
        setVimState("INSERT");
        moveCursor(cursorPos + 1);
        break;
      case "o": {
        // Open line below and insert
        const { lineEnd } = getLineBounds();
        const newText = text.substring(0, lineEnd) + "\n" + text.substring(lineEnd);
        onChange(newText);
        pushHistory(newText);
        setVimState("INSERT");
        moveCursor(lineEnd + 1);
        break;
      }
      case "O": {
        // Open line above and insert
        const { lineStart } = getLineBounds();
        const newText = text.substring(0, lineStart) + "\n" + text.substring(lineStart);
        onChange(newText);
        pushHistory(newText);
        setVimState("INSERT");
        moveCursor(lineStart);
        break;
      }
      case "h": // Left
        moveCursor(cursorPos - 1);
        break;
      case "l": // Right
        moveCursor(cursorPos + 1);
        break;
      case "j": { // Down
        const nextLine = text.indexOf("\n", cursorPos);
        if (nextLine !== -1) moveCursor(nextLine + 1);
        break;
      }
      case "k": { // Up
        const prevLineEnd = text.lastIndexOf("\n", cursorPos - 1);
        if (prevLineEnd !== -1) {
          const prevLineStart = text.lastIndexOf("\n", prevLineEnd - 1) + 1;
          moveCursor(prevLineStart);
        }
        break;
      }
      case "0": { // Line start
        const { lineStart } = getLineBounds();
        moveCursor(lineStart);
        break;
      }
      case "$": { // Line end
        const { lineEnd } = getLineBounds();
        moveCursor(lineEnd);
        break;
      }
      case "w": { // Next word
        const match = text.substring(cursorPos).search(/\s\S/);
        if (match !== -1) moveCursor(cursorPos + match + 1);
        break;
      }
      case "b": { // Prev word
        const sub = text.substring(0, cursorPos);
        const match = sub.search(/\S+\s*$/);
        if (match !== -1) moveCursor(match);
        break;
      }
      case "d":
        setPendingCmd("d");
        break;
      case "u": { // Undo
        if (historyIndexRef.current > 0) {
          historyIndexRef.current -= 1;
          const prevVal = historyRef.current[historyIndexRef.current];
          onChange(prevVal);
        }
        break;
      }
      case "x": { // Delete char under cursor
        if (cursorPos < text.length) {
          const newText = text.substring(0, cursorPos) + text.substring(cursorPos + 1);
          onChange(newText);
          pushHistory(newText);
        }
        break;
      }
      default:
        break;
    }
  };

  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const lineCount = value ? value.split("\n").length : 0;

  const wrapperClasses = isFullscreen
    ? "fixed inset-0 z-[100] bg-slate-950 p-4 md:p-8 flex flex-col justify-between backdrop-blur-xl border-4 border-purple-500/40 animate-in fade-in zoom-in-95 duration-200"
    : "relative flex flex-col space-y-2 w-full";

  return (
    <div className={`${wrapperClasses} ${className}`}>
      {/* Editor Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center space-x-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
            <Type className="w-3.5 h-3.5 text-purple-400" />
            {label}
          </label>

          {/* Vim Mode Badge / Indicator */}
          {isVimMode && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-all duration-300 border ${
                vimState === "NORMAL"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-950"
                  : "bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm shadow-sky-950"
              }`}
            >
              -- {vimState} -- {pendingCmd ? `[${pendingCmd}]` : ""}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {/* Dynamically Resizing Toggle */}
          {showAutoResizeToggle && (
            <button
              type="button"
              onClick={() => setAutoResize(!autoResize)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition ${
                autoResize
                  ? "bg-purple-600/30 border-purple-500/50 text-purple-200 font-medium"
                  : "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
              title={autoResize ? "Auto-expanding typing space enabled" : "Fixed typing space"}
            >
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>{autoResize ? "Dynamic Space: ON" : "Dynamic Space: OFF"}</span>
            </button>
          )}

          {/* Vim Mode Toggle */}
          {showVimToggle && (
            <button
              type="button"
              onClick={() => {
                const nextVim = !isVimMode;
                setIsVimMode(nextVim);
                setVimState(nextVim ? "NORMAL" : "INSERT");
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition ${
                isVimMode
                  ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-200 font-medium"
                  : "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
              title="Toggle Vim Mode keybindings"
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isVimMode ? "Vim Mode: ON" : "Vim Mode: OFF"}</span>
            </button>
          )}

          {/* Fullscreen Toggle */}
          {showFullscreenToggle && (
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition ${
                isFullscreen
                  ? "bg-amber-600/30 border-amber-500/50 text-amber-200 font-medium"
                  : "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Exit Fullscreen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Fullscreen</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main Textarea Space */}
      <div className={`relative flex-1 ${isFullscreen ? "my-4 overflow-y-auto" : ""}`}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleTextChange}
          onKeyDown={handleVimKeyDown}
          placeholder={
            isVimMode && vimState === "NORMAL"
              ? "Vim Normal Mode active. Press 'i' or 'a' to enter Insert mode, 'dd' to delete line, 'u' to undo."
              : placeholder
          }
          className={`w-full bg-slate-900/90 border rounded-2xl p-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition leading-relaxed ${
            isVimMode && vimState === "NORMAL"
              ? "border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/40 cursor-default bg-emerald-950/10"
              : "border-slate-800 focus:border-purple-500"
          } ${autoResize && !isFullscreen ? "resize-none overflow-hidden" : "resize-y"}`}
          style={{
            minHeight: isFullscreen ? "70vh" : `${minRows * 24}px`,
            fontFamily: isVimMode ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : "inherit",
          }}
        />
      </div>

      {/* Bottom Status / Stats Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs text-slate-400">
        <div className="flex items-center space-x-3">
          <span>{wordCount} words</span>
          <span>•</span>
          <span>{value.length} chars</span>
          <span>•</span>
          <span>{lineCount} lines</span>
        </div>

        {isVimMode && (
          <span className="text-[11px] text-slate-400 italic">
            {vimState === "NORMAL"
              ? "Press 'i' to type, 'w'/'b' to move, 'dd' to delete line"
              : "Press Esc to enter Normal mode"}
          </span>
        )}
      </div>
    </div>
  );
}
