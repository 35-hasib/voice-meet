import { PUBLIC_STUN_URLS } from "./config";
import { getIceServers } from "./meeting-api";
import type { IceServer } from "@/types/rtc";

export interface ResolvedIceConfiguration {
  iceServers: IceServer[];
  hasTurn: boolean;
  hadCredentialsError: boolean;
}

function serverKey(server: IceServer): string {
  const urls = Array.isArray(server.urls) ? server.urls.join(",") : server.urls;
  return `${urls}|${server.username ?? ""}`;
}

function mergeIceServers(...groups: IceServer[][]): IceServer[] {
  const merged = new Map<string, IceServer>();

  for (const server of groups.flat()) {
    merged.set(serverKey(server), server);
  }

  return [...merged.values()];
}

export async function resolveIceConfiguration(
  meetingCode: string,
): Promise<ResolvedIceConfiguration> {
  const publicStunServers: IceServer[] = PUBLIC_STUN_URLS.map((urls) => ({ urls }));
  let credentialsServers: IceServer[] = [];
  let hadCredentialsError = false;

  try {
    const response = await getIceServers(meetingCode);
    credentialsServers = response.iceServers;
  } catch {
    hadCredentialsError = publicStunServers.length === 0;
  }

  const iceServers = mergeIceServers(publicStunServers, credentialsServers);

  return {
    iceServers,
    hasTurn: iceServers.some((server) => server.username !== undefined),
    hadCredentialsError,
  };
}
