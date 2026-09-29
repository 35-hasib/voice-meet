import { z } from "zod";
import { normalizeCloudflareTtlSeconds } from "../services/ice-credentials.service.js";

function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const optionalText = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);

const environmentSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  FRONTEND_URL: z.string().trim().min(1),
  PORT: z.string().trim().min(1).default("4000"),
  TRUST_PROXY: optionalText,
  STUN_SERVER_URL: optionalText,
  TURN_PROVIDER: optionalText,
  TURN_SERVER_URL: optionalText,
  TURN_SERVER_USERNAME: optionalText,
  TURN_SERVER_CREDENTIAL: optionalText,
  CLOUDFLARE_TURN_KEY_ID: optionalText,
  CLOUDFLARE_TURN_API_TOKEN: optionalText,
  CLOUDFLARE_TURN_TTL_SECONDS: optionalText,
});

export type TurnProviderKind = "static" | "cloudflare";

export interface AppConfig {
  port: number;
  trustProxy: boolean | number;
  databaseUrl: string;
  frontendUrls: string[];
  stunUrls: string[];
  turn: {
    urls: string[];
    usernamePrefix: string;
    sharedSecret: string;
  } | null;
  turnProviderKind: TurnProviderKind | null;
  cloudflareTurn: {
    keyId: string;
    apiToken: string;
    ttlSeconds: number;
  } | null;
}

function configurationError(messages: string[]): never {
  throw new Error(`Invalid environment configuration: ${messages.join("; ")}`);
}

function splitUrls(value: string, variableName: string): string[] {
  const parts = value.split(",").map((part) => part.trim());

  if (parts.some((part) => part.length === 0)) {
    configurationError([`${variableName} contains an empty URL`]);
  }

  return [...new Set(parts)];
}

function validateDatabaseUrl(value: string): void {
  try {
    const parsed = new URL(value);

    if (
      (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") ||
      parsed.hostname.length === 0
    ) {
      configurationError(["DATABASE_URL must be a PostgreSQL URL"]);
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("Invalid environment configuration:")) {
      throw error;
    }

    configurationError(["DATABASE_URL must be a valid PostgreSQL URL"]);
  }
}

const ORIGIN_EXAMPLE = "https://your-app.vercel.app";

function parseFrontendUrls(value: string): string[] {
  const origins = splitUrls(value, "FRONTEND_URL").map((entry) => {
    if (entry === "*") {
      configurationError(["FRONTEND_URL cannot contain a wildcard"]);
    }

    let parsed: URL;

    try {
      parsed = new URL(entry);
    } catch {
      configurationError([
        `FRONTEND_URL entry "${entry}" is not a valid URL. Use a bare origin such as ${ORIGIN_EXAMPLE}`,
      ]);
    }

    const problems: string[] = [];

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      problems.push("must start with http:// or https://");
    }

    if (parsed.username.length > 0 || parsed.password.length > 0) {
      problems.push("must not contain a username or password");
    }

    if (parsed.pathname !== "/" && parsed.pathname !== "") {
      problems.push(`must not contain the path "${parsed.pathname}"`);
    }

    if (parsed.search.length > 0) {
      problems.push("must not contain a query string");
    }

    if (parsed.hash.length > 0) {
      problems.push("must not contain a # fragment");
    }

    if (problems.length > 0) {
      configurationError([
        `FRONTEND_URL entry "${entry}" ${problems.join("; ")}. Use a bare origin such as ${ORIGIN_EXAMPLE}`,
      ]);
    }

    return parsed.origin;
  });

  return [...new Set(origins)];
}

function parseIntegerInRange(
  value: string,
  variableName: string,
  minimum: number,
  maximum: number,
): number {
  const problem = `${variableName} must be an integer between ${minimum.toString()} and ${maximum.toString()}`;

  if (!/^\d+$/.test(value)) {
    configurationError([problem]);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    configurationError([problem]);
  }

  return parsed;
}

function parsePort(value: string): number {
  return parseIntegerInRange(value, "PORT", 1, 65_535);
}

function parseTrustProxy(value: string | undefined): boolean | number {
  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  if (/^\d+$/.test(normalized)) {
    const parsed = Number(normalized);

    if (Number.isSafeInteger(parsed) && parsed > 1) {
      return parsed;
    }
  }

  configurationError([
    'TRUST_PROXY must be "true", "false", or the number of trusted proxy hops',
  ]);
}

function toParsableUrl(url: string): URL {
  const schemeSeparator = url.indexOf(":");

  if (schemeSeparator <= 0) {
    throw new Error("missing scheme");
  }

  const scheme = url.slice(0, schemeSeparator + 1);
  const remainder = url.slice(schemeSeparator + 1);

  return new URL(
    remainder.startsWith("//") || remainder.length === 0
      ? url
      : `${scheme}//${remainder}`,
  );
}

function parseIceUrls(
  value: string | undefined,
  variableName: string,
  allowedProtocols: readonly string[],
): string[] {
  if (value === undefined) {
    return [];
  }

  return splitUrls(value, variableName).map((url) => {
    try {
      const parsed = toParsableUrl(url);

      if (
        !allowedProtocols.includes(parsed.protocol) ||
        parsed.hostname.length === 0 ||
        parsed.username.length > 0 ||
        parsed.password.length > 0
      ) {
        configurationError([
          `${variableName} entries must be valid ICE URLs without embedded credentials`,
        ]);
      }

      return url;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith("Invalid environment configuration:")) {
        throw error;
      }

      configurationError([`${variableName} contains an invalid URL`]);
    }
  });
}

function parseTurnConfig(
  urlsValue: string | undefined,
  usernameValue: string | undefined,
  credentialValue: string | undefined,
): AppConfig["turn"] {
  const configuredValues = [urlsValue, usernameValue, credentialValue].filter(
    (value) => value !== undefined,
  );

  if (configuredValues.length === 0) {
    return null;
  }

  if (configuredValues.length !== 3) {
    configurationError([
      "TURN_SERVER_URL, TURN_SERVER_USERNAME, and TURN_SERVER_CREDENTIAL must be configured together",
    ]);
  }

  const urls = parseIceUrls(urlsValue, "TURN_SERVER_URL", ["turn:", "turns:"]);

  if (!/^[A-Za-z0-9._~-]{1,64}$/.test(usernameValue ?? "")) {
    configurationError([
      "TURN_SERVER_USERNAME must be a 1-64 character username prefix",
    ]);
  }

  return {
    urls,
    usernamePrefix: usernameValue ?? "",
    sharedSecret: credentialValue ?? "",
  };
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = environmentSchema.safeParse(environment);

  if (!parsed.success) {
    const messages = parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
    );
    configurationError(messages);
  }

  validateDatabaseUrl(parsed.data.DATABASE_URL);

  const turn = parseTurnConfig(
    parsed.data.TURN_SERVER_URL,
    parsed.data.TURN_SERVER_USERNAME,
    parsed.data.TURN_SERVER_CREDENTIAL,
  );
  const cloudflareTurn = parseCloudflareTurnConfig(
    parsed.data.CLOUDFLARE_TURN_KEY_ID,
    parsed.data.CLOUDFLARE_TURN_API_TOKEN,
    parsed.data.CLOUDFLARE_TURN_TTL_SECONDS,
  );
  const turnProviderKind = parseTurnProviderKind(parsed.data.TURN_PROVIDER, turn, cloudflareTurn);

  return {
    port: parsePort(parsed.data.PORT),
    trustProxy: parseTrustProxy(parsed.data.TRUST_PROXY),
    databaseUrl: parsed.data.DATABASE_URL,
    frontendUrls: parseFrontendUrls(parsed.data.FRONTEND_URL),
    stunUrls: parseIceUrls(
      parsed.data.STUN_SERVER_URL,
      "STUN_SERVER_URL",
      ["stun:"],
    ),
    turn,
    turnProviderKind,
    cloudflareTurn,
  };
}

function parseCloudflareTurnConfig(
  keyIdValue: string | undefined,
  apiTokenValue: string | undefined,
  ttlValue: string | undefined,
): AppConfig["cloudflareTurn"] {
  const configuredValues = [keyIdValue, apiTokenValue].filter(
    (value) => value !== undefined,
  );

  if (configuredValues.length === 0) {
    return null;
  }

  if (configuredValues.length !== 2) {
    configurationError([
      "CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN must be configured together",
    ]);
  }

  return {
    keyId: keyIdValue ?? "",
    apiToken: apiTokenValue ?? "",
    ttlSeconds: normalizeCloudflareTtlSeconds(
      ttlValue === undefined
        ? undefined
        : parseIntegerInRange(ttlValue, "CLOUDFLARE_TURN_TTL_SECONDS", 300, 172_800),
    ),
  };
}

function parseTurnProviderKind(
  providerValue: string | undefined,
  turn: AppConfig["turn"],
  cloudflareTurn: AppConfig["cloudflareTurn"],
): TurnProviderKind | null {
  const normalized = providerValue?.toLowerCase();

  if (normalized === "cloudflare") {
    if (cloudflareTurn === null) {
      configurationError([
        "TURN_PROVIDER=cloudflare requires CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN",
      ]);
    }

    if (turn !== null) {
      configurationError([
        "TURN_PROVIDER=cloudflare cannot be combined with TURN_SERVER_URL, TURN_SERVER_USERNAME, and TURN_SERVER_CREDENTIAL",
      ]);
    }

    return "cloudflare";
  }

  if (normalized !== undefined && normalized !== "static") {
    configurationError(['TURN_PROVIDER must be "static" or "cloudflare"']);
  }

  if (turn === null) {
    if (cloudflareTurn !== null) {
      configurationError([
        "CLOUDFLARE_TURN_KEY_ID requires TURN_PROVIDER=cloudflare",
      ]);
    }

    return null;
  }

  return "static";
}
