"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database, HardDrive, Cloud, ArrowRight, RefreshCw, X,
  CheckCircle2, AlertCircle, Zap, ShieldCheck, Sparkles
} from "lucide-react";
import { toast } from "sonner";

interface DatabaseUsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMigrationComplete?: () => void;
}

interface UsageData {
  totalLogs: number;
  textJournalsCount: number;
  audioJournalsCount: number;
  hackClubCdnCount: number;
  supabaseStorageCount: number;
  totalAudioSizeMB: string;
  supabaseStorageMB: string;
  hackClubCdnMB: string;
  percentMigrated: number;
}

export default function DatabaseUsageModal({
  isOpen,
  onClose,
  onMigrationComplete,
}: DatabaseUsageModalProps) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any | null>(null);

  const fetchUsage = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/db-usage");
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch (e) {
      console.error("Failed to fetch usage:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsage();
      setMigrationResult(null);
    }
  }, [isOpen]);

  const handleRunMigration = async () => {
    setIsMigrating(true);
    setMigrationResult(null);
    const toastId = toast.loading("Migrating audio files to Hack Club CDN & freeing Supabase storage...");

    try {
      const res = await fetch("/api/migrate-cdn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Migration failed");
      }

      const data = await res.json();
      setMigrationResult(data);

      toast.success(
        `Migration Complete! ${data.migratedCount} entries moved to Hack Club CDN (${data.freedMB} MB freed)!`,
        { id: toastId }
      );

      fetchUsage();
      onMigrationComplete?.();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to complete migration", { id: toastId });
    } finally {
      setIsMigrating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-md h-full bg-slate-950/95 border-l border-slate-800 shadow-2xl flex flex-col z-10 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Database className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                Database & Storage Usage
              </h3>
              <p className="text-xs text-slate-400">
                Track storage size & offload audio to Hack Club CDN
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
              <span>Calculating database metrics...</span>
            </div>
          ) : usage ? (
            <>
              {(usage as any).isQuotaExceeded && (
                <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 space-y-2 text-amber-200 text-xs">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Supabase Storage Quota Restricted (402)</span>
                  </div>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    Your Supabase project exceeded free storage limits and has read/write restrictions.
                  </p>
                  <div className="bg-amber-950/40 p-2.5 rounded-xl border border-amber-500/30 text-[11px] text-slate-300">
                    💡 All new voice recordings now upload directly to <strong>Hack Club CDN</strong> automatically! To unblock old entries, clear spend caps in Supabase Dashboard.
                  </div>
                </div>
              )}
              {/* Storage Overview Card */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-sky-400" />
                    Total Audio Storage
                  </h4>
                  <span className="text-sm font-extrabold text-slate-100 font-mono">
                    {usage.totalAudioSizeMB} MB
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-sky-400 h-full transition-all duration-500"
                      style={{ width: `${usage.percentMigrated}%` }}
                      title={`Hack Club CDN: ${usage.hackClubCdnMB} MB`}
                    />
                    <div
                      className="bg-amber-500/80 h-full transition-all duration-500"
                      style={{ width: `${100 - usage.percentMigrated}%` }}
                      title={`Supabase Storage: ${usage.supabaseStorageMB} MB`}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-400 font-medium pt-1">
                    <span className="flex items-center gap-1 text-sky-300">
                      <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                      Hack Club CDN ({usage.percentMigrated}%)
                    </span>
                    <span className="flex items-center gap-1 text-amber-400">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      Supabase Storage ({100 - usage.percentMigrated}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Database Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Journal Logs</span>
                  <div className="text-xl font-bold text-slate-100">{usage.totalLogs}</div>
                  <span className="text-[10px] text-slate-400">{usage.textJournalsCount} Text · {usage.audioJournalsCount} Audio</span>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Supabase Storage</span>
                  <div className="text-xl font-bold text-amber-400">{usage.supabaseStorageMB} MB</div>
                  <span className="text-[10px] text-slate-400">{usage.supabaseStorageCount} files using quota</span>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Hack Club CDN</span>
                  <div className="text-xl font-bold text-sky-400">{usage.hackClubCdnMB} MB</div>
                  <span className="text-[10px] text-slate-400">{usage.hackClubCdnCount} files offloaded</span>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Freed Quota Potential</span>
                  <div className="text-xl font-bold text-emerald-400">+{usage.supabaseStorageMB} MB</div>
                  <span className="text-[10px] text-slate-400">Via 1-click migration</span>
                </div>
              </div>

              {/* Hack Club CDN Offload Card */}
              <div className="bg-gradient-to-br from-purple-950/40 to-slate-900 border border-purple-900/50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-purple-300 font-bold text-xs">
                    <Cloud className="w-4 h-4 text-purple-400" />
                    <span>Hack Club CDN Storage Offloading</span>
                  </div>
                  {(usage as any).cdnQuotaInfo && (
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                      Tier: {(usage as any).cdnQuotaInfo.quota_tier || "verified"}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Offloading audio entries to Hack Club CDN frees up your Supabase storage quota while keeping playback instant.
                </p>

                {(usage as any).cdnQuotaInfo && (
                  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-purple-900/40 text-[11px] text-slate-300 flex justify-between font-mono">
                    <span>Account: {(usage as any).cdnQuotaInfo.email || "Hack Club User"}</span>
                    <span className="text-purple-400 font-bold">
                      {((usage as any).cdnQuotaInfo.storage_used / (1024 * 1024)).toFixed(1)} MB / {((usage as any).cdnQuotaInfo.storage_limit / (1024 * 1024 * 1024)).toFixed(0)} GB Limit
                    </span>
                  </div>
                )}

                <button
                  onClick={handleRunMigration}
                  disabled={isMigrating || usage.supabaseStorageCount === 0}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-900/40 transition disabled:opacity-50 cursor-pointer"
                >
                  {isMigrating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-purple-200" />
                      <span>Migrating Audio to Hack Club CDN...</span>
                    </>
                  ) : usage.supabaseStorageCount === 0 ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>All Files Migrated to Hack Club CDN</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-yellow-300" />
                      <span>Migrate {usage.supabaseStorageCount} Audio Files to CDN</span>
                    </>
                  )}
                </button>
              </div>

              {/* Migration Log Results Output */}
              {migrationResult && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-emerald-400 font-bold">
                    <span>Migration Completed Successfully</span>
                    <span>{migrationResult.freedMB} MB Freed</span>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto text-slate-300 font-mono text-[11px] pt-2 border-t border-slate-800">
                    {migrationResult.results?.map((res: any, idx: number) => (
                      <div key={idx} className="flex justify-between truncate">
                        <span>• {res.title}</span>
                        <span className="text-sky-300">{res.sizeMB} MB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
