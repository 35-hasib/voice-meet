import type { Metadata } from "next";
import { MeetingLobby } from "@/components/meeting-lobby";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ meetingCode: string }>;
}): Promise<Metadata> {
  const { meetingCode } = await params;

  return {
    title: `Audio meeting ${meetingCode}`,
    robots: { index: false, follow: false },
  };
}

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ meetingCode: string }>;
}): Promise<React.JSX.Element> {
  const { meetingCode } = await params;

  return <MeetingLobby meetingCode={meetingCode} />;
}
