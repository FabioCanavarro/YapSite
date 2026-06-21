"use client";

import { useMemo, useRef, useEffect } from "react";

interface Log {
  created_at: string;
  ai_mood_color?: string;
}

interface YapHeatmapProps {
  logs: Log[];
}

export default function YapHeatmap({ logs }: YapHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Group logs by YYYY-MM-DD date string
  const logsByDate = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((log) => {
      if (!log.created_at || !log.ai_mood_color) return;
      const dateStr = new Date(log.created_at).toISOString().split("T")[0];
      // Keep the latest entry's mood color if multiple exist for a day
      map.set(dateStr, log.ai_mood_color);
    });
    return map;
  }, [logs]);

  // Generate grid dates covering 52 weeks (aligned to starting Sunday)
  const gridWeeks = useMemo(() => {
    const today = new Date();
    const startDate = new Date();
    
    // Set start date to 52 weeks ago
    startDate.setDate(today.getDate() - 364);
    // Align to the starting Sunday of that week
    const startDay = startDate.getDay();
    startDate.setDate(startDate.getDate() - startDay);

    const weeks: Date[][] = [];
    let currentDay = new Date(startDate);

    for (let w = 0; w < 53; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(new Date(currentDay));
        currentDay.setDate(currentDay.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }, []);

  // Auto-scroll to the end (right side, showing recent entries) on mount
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = containerRef.current.scrollWidth;
    }
  }, [gridWeeks]);

  const monthLabels = useMemo(() => {
    const labels: { text: string; colIndex: number }[] = [];
    let lastMonth = -1;

    gridWeeks.forEach((week, colIndex) => {
      const firstDayOfWeek = week[0];
      const currentMonth = firstDayOfWeek.getMonth();
      if (currentMonth !== lastMonth) {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        labels.push({
          text: monthNames[currentMonth],
          colIndex,
        });
        lastMonth = currentMonth;
      }
    });

    return labels;
  }, [gridWeeks]);

  return (
    <div className="w-full glass-panel rounded-3xl p-5 select-none">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold tracking-wider text-overlay uppercase">
          Yap Frequency Heatmap
        </h3>
        <span className="text-xs text-overlay font-light">
          {logs.length} total entries recorded
        </span>
      </div>

      <div
        ref={containerRef}
        className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-surface scrollbar-track-crust pb-2"
      >
        <div className="min-w-[650px] flex flex-col gap-2">
          {/* Month Labels row */}
          <div className="h-4 relative text-[10px] text-overlay font-light">
            {monthLabels.map((label, idx) => (
              <span
                key={idx}
                className="absolute"
                style={{ left: `${label.colIndex * 14}px` }}
              >
                {label.text}
              </span>
            ))}
          </div>

          {/* Grid rows */}
          <div className="flex gap-[3px]">
            {gridWeeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-[3px]">
                {week.map((day, dIdx) => {
                  const dateStr = day.toISOString().split("T")[0];
                  const moodColor = logsByDate.get(dateStr);
                  const isFuture = day > new Date();

                  // Set color
                  let bgColor = "#181825"; // default Mantle empty block
                  if (isFuture) {
                    bgColor = "#11111b"; // darker crust block for future
                  } else if (moodColor) {
                    bgColor = moodColor;
                  }

                  const formattedDate = day.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <div
                      key={dIdx}
                      style={{ backgroundColor: bgColor }}
                      title={`${formattedDate}${moodColor ? " - Active Journal Entry" : " - No entry"}`}
                      className="w-[11px] h-[11px] rounded-[2px] transition-colors duration-200 hover:scale-125 cursor-help"
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid Legend */}
      <div className="flex justify-end items-center gap-4 mt-3 text-[10px] text-overlay">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[2px] bg-mantle border border-surface" />
          <span>No Yap</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-stressed" />
            <span>Stressed</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-calm" />
            <span>Calm</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-productive" />
            <span>Focused</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-hype" />
            <span>Excited</span>
          </div>
        </div>
      </div>
    </div>
  );
}
