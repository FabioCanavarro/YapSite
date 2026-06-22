"use client";

import { useEffect, useRef, useState } from "react";
import { Info, AlertTriangle, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";

interface AdmonitionProps {
  type: string;
  title?: string;
  content: string;
}

function Admonition({ type, title, content }: AdmonitionProps) {
  const t = type.toLowerCase().trim();
  
  let color = "#74c7ec"; // default calm blue
  let Icon = Info;
  let label = "Note";

  if (t === "warning" || t === "caution" || t === "attention") {
    color = "#fab387"; // Tired orange
    Icon = AlertTriangle;
    label = "Warning";
  } else if (t === "danger" || t === "error" || t === "failure" || t === "bug") {
    color = "#f38ba8"; // Stressed red
    Icon = AlertCircle;
    label = "Danger";
  } else if (t === "success" || t === "done" || t === "check") {
    color = "#a6e3a1"; // Focused green
    Icon = CheckCircle2;
    label = "Success";
  } else if (t === "tip" || t === "hint" || t === "important" || t === "idea") {
    color = "#cba6f7"; // Excited mauve
    Icon = Sparkles;
    label = "Tip";
  }

  const finalTitle = title || label;

  return (
    <div 
      className="w-full my-4 rounded-2xl p-4 border-l-4 text-left flex flex-col gap-2 relative z-10"
      style={{ 
        borderColor: color, 
        backgroundColor: `${color}0b` // 4% opacity tint
      }}
    >
      <div className="flex items-center gap-2 font-bold text-sm" style={{ color }}>
        <Icon className="w-4.5 h-4.5 shrink-0" />
        <span>{finalTitle}</span>
      </div>
      <div className="text-xs text-text/90 leading-relaxed font-sans whitespace-pre-wrap pl-1">
        {content}
      </div>
    </div>
  );
}

function formatItalic(text: string): React.ReactNode[] {
  const italicParts = text.split(/(\*.*?\*)/g);
  return italicParts.map((part, iIdx) => {
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={`i-${iIdx}`} className="italic text-text/90">{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function formatInline(text: string): React.ReactNode[] {
  const boldParts = text.split(/(\*\*.*?\*\*)/g);
  const result: React.ReactNode[] = [];

  boldParts.forEach((part, bIdx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const innerText = part.slice(2, -2);
      result.push(
        <strong key={`b-${bIdx}`} className="font-bold text-hype">
          {formatItalic(innerText)}
        </strong>
      );
    } else {
      result.push(...formatItalic(part));
    }
  });

  return result;
}

function renderMarkdownBlocks(text: string) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentParagraph: string[] = [];
  let currentList: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="mb-4 text-md text-text/95 leading-relaxed">
          {formatInline(currentParagraph.join(" "))}
        </p>
      );
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (currentList.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-6 mb-4 space-y-1.5 text-md text-text/95">
          {currentList.map((item, idx) => (
            <li key={idx}>{formatInline(item)}</li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === "") {
      flushParagraph();
      flushList();
      continue;
    }

    if (line === "---") {
      flushParagraph();
      flushList();
      blocks.push(<hr key={`hr-${blocks.length}`} className="border-t border-surface/50 my-6" />);
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h1 key={`h1-${blocks.length}`} className="text-2xl font-extrabold text-text mt-6 mb-3">
          {formatInline(line.slice(2))}
        </h1>
      );
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="text-xl font-bold text-text mt-5 mb-2.5">
          {formatInline(line.slice(3))}
        </h2>
      );
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="text-lg font-bold text-text mt-4 mb-2">
          {formatInline(line.slice(4))}
        </h3>
      );
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      currentList.push(line.slice(2));
      continue;
    }

    // Normal line - add to current paragraph
    flushList();
    currentParagraph.push(line);
  }

  flushParagraph();
  flushList();

  return <div className="flex flex-col">{blocks}</div>;
}

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  // Custom Obsidian Admonitions blocks (```ad-note ... ```) and code blocks parsing
  const lines = content.split("\n");
  const renderedElements: React.ReactNode[] = [];
  let i = 0;
  let markdownAccumulator: string[] = [];

  const flushMarkdownAccumulator = () => {
    if (markdownAccumulator.length > 0) {
      renderedElements.push(
        <div key={`md-block-${renderedElements.length}`}>
          {renderMarkdownBlocks(markdownAccumulator.join("\n"))}
        </div>
      );
      markdownAccumulator = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const admMatch = trimmedLine.match(/^(`{3,4})ad-([a-zA-Z0-9-]+)/);

    // Detect admonition start (3 or 4 backticks)
    if (admMatch) {
      flushMarkdownAccumulator();
      const backticks = admMatch[1];
      const type = admMatch[2];
      const bodyLines: string[] = [];
      let customTitle = "";
      i++;

      while (i < lines.length && !lines[i].trim().startsWith(backticks)) {
        const bodyLine = lines[i];
        if (bodyLine.trim().startsWith("title:")) {
          customTitle = bodyLine.trim().slice(6).trim();
        } else {
          bodyLines.push(bodyLine);
        }
        i++;
      }
      i++; // skip closing backticks

      renderedElements.push(
        <Admonition 
          key={`admonition-${renderedElements.length}`} 
          type={type} 
          title={customTitle} 
          content={bodyLines.join("\n")} 
        />
      );
      continue;
    }

    // Detect normal code block start (3 or 4 backticks)
    const codeMatch = trimmedLine.match(/^(`{3,4})/);
    if (codeMatch) {
      flushMarkdownAccumulator();
      const backticks = codeMatch[1];
      const bodyLines: string[] = [];
      i++;

      while (i < lines.length && !lines[i].trim().startsWith(backticks)) {
        bodyLines.push(lines[i]);
        i++;
      }
      i++; // skip closing backticks

      renderedElements.push(
        <pre 
          key={`code-block-${renderedElements.length}`} 
          className="p-4 bg-crust rounded-2xl border border-surface text-xs font-mono text-text/90 my-3 overflow-x-auto select-text"
        >
          <code>{bodyLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    markdownAccumulator.push(line);
    i++;
  }

  flushMarkdownAccumulator();

  return <div className="markdown-content">{renderedElements}</div>;
}
