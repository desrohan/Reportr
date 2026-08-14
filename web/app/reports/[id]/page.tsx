import { createClient } from "../../../utils/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ReportReplayViewer } from "../components/ReportReplayViewer";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Browser tab + link previews show the recording title (with "| Reportr"
// appended by the root layout's title template).
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  const title = report?.title || "Shared Recording";
  const description =
    "Watch the recording and inspect the captured network, console, and session replay.";

  // Set openGraph/twitter explicitly: the root layout defines its own
  // openGraph.title, which otherwise wins over this page's plain `title`.
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
  };
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
