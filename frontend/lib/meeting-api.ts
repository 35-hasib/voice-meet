import { apiRequest } from "./api-client";
import type { IceServerResponse } from "@/types/rtc";
import type { Meeting } from "@/types/meeting";

export function createMeeting(): Promise<Meeting> {
  return apiRequest<Meeting>("/api/meetings", { method: "POST" });
}

export function getMeeting(meetingCode: string): Promise<Meeting> {
  return apiRequest<Meeting>(`/api/meetings/${encodeURIComponent(meetingCode)}`);
}

export function getIceServers(meetingCode: string): Promise<IceServerResponse> {
  return apiRequest<IceServerResponse>(
    `/api/rtc/credentials?meetingCode=${encodeURIComponent(meetingCode)}`,
  );
}
