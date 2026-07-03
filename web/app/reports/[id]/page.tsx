import { createClient } from "../../../utils/supabase/server";
import { notFound } from "next/navigation";
import { ReportReplayViewer } from "../components/ReportReplayViewer";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReportPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // 1. Fetch the report metadata
  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .single();

  if (reportError || !report) {
    notFound();
  }

  // 2. Fetch the report events
  const { data: dbEvents, error: eventsError } = await supabase
    .from("report_events")
    .select("*")
    .eq("report_id", id)
    .order("timestamp_ms", { ascending: true });

  if (eventsError) {
    console.error("Error fetching report events:", eventsError);
  }

  // Reconstruct events as RawEvents from JSONB column
  const events = (dbEvents || []).map((row: any) => row.data);

  return (
    <ReportReplayViewer
      initialTitle={report.title || "Untitled Recording"}
      videoUrl={report.video_url || ""}
      events={events}
      isDraft={false}
    />
  );
}
