import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  return handleRetryPending(request);
}

export async function POST(request: NextRequest) {
  return handleRetryPending(request);
}

async function handleRetryPending(request: NextRequest) {
  try {
    const adminSupabase = createAdminClient();

    // Fetch all logs with processing_status = 'pending' or 'failed'
    const { data: pendingLogs, error: fetchErr } = await adminSupabase
      .from("journal_logs")
      .select("id, user_id, audio_url, processing_status, created_at")
      .or("processing_status.eq.pending,processing_status.eq.failed")
      .neq("processing_status", "settings_profile")
      .neq("processing_status", "knowledge_base")
      .order("created_at", { ascending: false })
      .limit(20);

    if (fetchErr) {
      console.error("[Cron Retry] Fetch pending logs error:", fetchErr);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!pendingLogs || pendingLogs.length === 0) {
      return NextResponse.json({ message: "No pending or failed logs to process.", processedCount: 0 });
    }

    console.log(`[Cron Retry] Found ${pendingLogs.length} pending/failed entries. Beginning auto-retry...`);

    const results = [];
    const origin = request.nextUrl.origin || "http://localhost:3000";

    for (const log of pendingLogs) {
      try {
        console.log(`[Cron Retry] Retrying log ID: ${log.id}...`);
        
        // Trigger process-audio API for this log
        const processRes = await fetch(`${origin}/api/process-audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            logId: log.id,
          }),
        });

        if (processRes.ok) {
          const resData = await processRes.json();
          results.push({ id: log.id, status: "success", title: resData.ai_title });
        } else {
          const errText = await processRes.text();
          console.warn(`[Cron Retry] Log ${log.id} retry failed: status ${processRes.status}`, errText);
          results.push({ id: log.id, status: "failed", error: `HTTP ${processRes.status}` });
        }
      } catch (logErr: any) {
        console.error(`[Cron Retry] Error processing log ${log.id}:`, logErr);
        results.push({ id: log.id, status: "failed", error: logErr.message || String(logErr) });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    return NextResponse.json({
      message: `Completed 12-hour retry process. Processed ${successCount}/${pendingLogs.length} entries successfully.`,
      processedCount: pendingLogs.length,
      successCount,
      results,
    });
  } catch (err: any) {
    console.error("[Cron Retry] Internal error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
