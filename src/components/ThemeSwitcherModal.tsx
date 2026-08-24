"use client";

import { useRef, useEffect } from "react";
import { X, Palette, Sparkles, Check } from "lucide-react";
import { animateThemeChange, animateModalEnter, PRESET_THEMES, ThemeColors } from "@/utils/gsapAnimations";

interface ThemeSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeThemeKey: string;
  onSelectTheme: (key: string) => void;
}

export default function ThemeSwitcherModal({
  isOpen,
  onClose,
  activeThemeKey,
  onSelectTheme
}: ThemeSwitcherModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      animateModalEnter(modalRef.current);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelect = (key: string, theme: ThemeColors) => {
    onSelectTheme(key);
    animateThemeChange(null, theme.hype);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-crust/85 backdrop-blur-md p-4">
      <div
        ref={modalRef}
        className="w-full max-w-md glass-panel p-6 rounded-3xl border border-hype/30 shadow-2xl flex flex-col gap-5 text-left bg-surface/40"
      >
        <div className="flex justify-between items-center border-b border-surface pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-hype/20 border border-hype/40 flex items-center justify-center">
              <Palette className="w-4 h-4 text-hype" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text flex items-center gap-1.5">
                Dynamic Theme Palette
              </h3>
              <p className="text-xs text-overlay">GSAP Color Scheme Interpolation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface text-overlay hover:text-text cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {Object.entries(PRESET_THEMES).map(([key, theme]: [string, ThemeColors]) => {
            const isSelected = activeThemeKey === key;
            return (
              <button
                key={key}
                onClick={() => handleSelect(key, theme)}
                className={`w-full p-3.5 rounded-2xl border transition-all text-left flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? "bg-surface border-hype shadow-lg shadow-hype/20"
                    : "bg-surface/30 border-surface/50 hover:bg-surface/60 hover:border-overlay/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-1.5 overflow-hidden">
                    <span className="w-4 h-4 rounded-full border border-base" style={{ backgroundColor: theme.base }} />
                    <span className="w-4 h-4 rounded-full border border-base" style={{ backgroundColor: theme.hype }} />
                    <span className="w-4 h-4 rounded-full border border-base" style={{ backgroundColor: theme.calm }} />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-text block">{theme.name}</span>
                  </div>
                </div>
                {isSelected ? (
                  <div className="w-6 h-6 rounded-full bg-hype text-crust flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                ) : (
                  <Sparkles className="w-4 h-4 text-overlay/40 hover:text-hype transition-colors" />
                )}
              </button>
            );
          })}
        </div>

        <div className="pt-2 border-t border-surface flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-hype text-crust text-xs font-bold hover:bg-hype/90 cursor-pointer shadow-md transition-transform active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
