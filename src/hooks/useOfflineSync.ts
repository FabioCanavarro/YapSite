import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getOfflineJournals, deleteOfflineJournal } from "@/utils/indexedDb";

export function useOfflineSync(onSyncComplete?: () => void) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Monitor network status
  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Connection restored! Syncing offline entries...");
      syncEntries();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Network connection lost. Recordings will be saved offline.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check on mount
    if (navigator.onLine) {
      syncEntries();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const syncEntries = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.onLine || isSyncing) return;

    try {
      const offlineEntries = await getOfflineJournals();
      if (offlineEntries.length === 0) return;

      setIsSyncing(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast.info("Offline journals found! Please sign in to sync them.");
        setIsSyncing(false);
        return;
      }

      toast.info(`Syncing ${offlineEntries.length} offline journal(s)...`, {
        id: "syncing-toast",
        duration: 10000,
      });

      for (const entry of offlineEntries) {
        try {
          const extension = entry.mimeType.split("/")[1] || "wav";
          const fileName = `${user.id}/sync-${Date.now()}-${entry.id}.${extension}`;

          let audioUrl = "";
          try {
            const cdnFormData = new FormData();
            cdnFormData.append("file", entry.blob, `sync-${Date.now()}.${extension}`);

            const cdnRes = await fetch("/api/cdn-upload", {
              method: "POST",
              body: cdnFormData,
            });

            if (cdnRes.ok) {
              const cdnJson = await cdnRes.json();
              if (cdnJson.url) {
                audioUrl = cdnJson.url;
              }
            }
          } catch (cdnErr) {
            console.warn("CDN upload failed during offline sync, falling back:", cdnErr);
          }

          if (!audioUrl) {
            const { error: uploadError } = await supabase.storage
              .from("audio_journals")
              .upload(fileName, entry.blob, {
                contentType: entry.mimeType,
                duplex: "half",
              });

            if (uploadError) {
              console.error("Offline upload error:", uploadError);
              continue;
            }

            const { data: urlData } = supabase.storage
              .from("audio_journals")
              .getPublicUrl(fileName);

            audioUrl = urlData.publicUrl;
          }

          // 3. Create Pending database record
          const { data: dbData, error: dbError } = await supabase
            .from("journal_logs")
            .insert({
              user_id: user.id,
              audio_url: audioUrl,
              processing_status: "pending",
              ai_title: "Offline Synced Entry",
              ai_mood_color: "#313244",
              raw_transcript: "Processing transcript...",
              tidied_log: "Syncing details with Gemini...",
              ai_tags: ["Offline"],
              custom_tags: [],
            })
            .select()
            .single();

          if (dbError) {
            console.error("Offline sync database error:", dbError);
            continue;
          }

          // 4. Trigger Gemini Processing API call
          fetch("/api/process-audio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ logId: dbData.id, removeFillerWords: true }),
          })
            .then(async (res) => {
              if (res.ok) {
                toast.success(`Entry "${dbData.ai_title || "Offline Sync"}" processed!`);
                if (onSyncComplete) onSyncComplete();
              } else {
                console.error("Failed to process synced audio");
              }
            })
            .catch((e) => console.error("Error triggering AI sync process:", e));

          // 5. Remove from IndexedDB cache
          await deleteOfflineJournal(entry.id);
        } catch (itemError) {
          console.error("Failed to sync individual journal item:", itemError);
        }
      }

      toast.dismiss("syncing-toast");
      toast.success("Offline journals uploaded successfully!");
      if (onSyncComplete) onSyncComplete();
    } catch (syncError) {
      console.error("Offline sync failed:", syncError);
      toast.dismiss("syncing-toast");
      toast.error("Offline sync encountered an error.");
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, onSyncComplete]);

  return { isOnline, isSyncing, syncEntries };
}
