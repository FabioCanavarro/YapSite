"use client";

import { motion } from "framer-motion";

interface SkeletonProps {
  count?: number;
  type?: "card" | "list" | "detail";
}

export default function JournalSkeleton({ count = 3, type = "card" }: SkeletonProps) {
  if (type === "detail") {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-6 animate-pulse p-4">
        {/* Title skeleton */}
        <div className="h-10 bg-slate-800/80 rounded-xl w-3/4"></div>
        
        {/* Meta badges skeleton */}
        <div className="flex gap-3">
          <div className="h-6 w-24 bg-slate-800/60 rounded-lg"></div>
          <div className="h-6 w-32 bg-slate-800/60 rounded-lg"></div>
          <div className="h-6 w-20 bg-slate-800/60 rounded-lg"></div>
        </div>

        {/* Content box skeleton */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
          <div className="h-4 bg-slate-800/70 rounded w-full"></div>
          <div className="h-4 bg-slate-800/70 rounded w-11/12"></div>
          <div className="h-4 bg-slate-800/70 rounded w-4/5"></div>
          <div className="h-4 bg-slate-800/70 rounded w-9/12"></div>
        </div>

        {/* Reflection skeleton */}
        <div className="bg-purple-950/20 border border-purple-900/30 rounded-2xl p-6 space-y-4">
          <div className="h-6 bg-purple-900/40 rounded w-1/3"></div>
          <div className="h-4 bg-purple-900/30 rounded w-full"></div>
          <div className="h-4 bg-purple-900/30 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="gsap-card bg-slate-900/70 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 space-y-4 animate-pulse shadow-lg"
        >
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="h-6 bg-slate-800/80 rounded-lg w-2/3"></div>
            <div className="h-3 w-3 rounded-full bg-slate-700"></div>
          </div>

          {/* Time & badge */}
          <div className="flex items-center space-x-2">
            <div className="h-5 w-20 bg-slate-800/60 rounded-md"></div>
            <div className="h-5 w-16 bg-slate-800/60 rounded-md"></div>
          </div>

          {/* Body lines */}
          <div className="space-y-2 pt-2">
            <div className="h-3.5 bg-slate-800/60 rounded w-full"></div>
            <div className="h-3.5 bg-slate-800/60 rounded w-4/5"></div>
            <div className="h-3.5 bg-slate-800/60 rounded w-3/5"></div>
          </div>

          {/* Footer tags */}
          <div className="flex gap-2 pt-3 border-t border-slate-800/60">
            <div className="h-5 w-14 bg-slate-800/50 rounded-full"></div>
            <div className="h-5 w-16 bg-slate-800/50 rounded-full"></div>
          </div>
        </div>
      ))}
    </div>
  );
}
