import { z } from "zod";

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
  STUN_SERVER_URL: optionalText,
  TURN_SERVER_URL: optionalText,
  TURN_SERVER_USERNAME: optionalText,
  TURN_SERVER_CREDENTIAL: optionalText,
});

export interface AppConfig {
  port: number;
  databaseUrl: string;
  frontendUrls: string[];
  stunUrls: string[];
  turn: {
    urls: string[];
    usernamePrefix: string;
    sharedSecret: string;
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

function parseFrontendUrls(value: string): string[] {
  const origins = splitUrls(value, "FRONTEND_URL").map((origin) => {
    if (origin === "*") {
      configurationError(["FRONTEND_URL cannot contain a wildcard"]);
    }

    try {
      const parsed = new URL(origin);

      if (
        (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
        parsed.username.length > 0 ||
        parsed.password.length > 0 ||
        parsed.pathname !== "/" ||
        parsed.search.length > 0 ||
        parsed.hash.length > 0
      ) {
        configurationError([
          "FRONTEND_URL entries must be HTTP(S) origins without credentials, paths, queries, or fragments",
        ]);
      }

      return parsed.origin;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith("Invalid environment configuration:")) {
        throw error;
      }

      configurationError(["FRONTEND_URL contains an invalid URL"]);
    }
  });

  return [...new Set(origins)];
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) {
    configurationError(["PORT must be an integer between 1 and 65535"]);
  }

  const port = Number(value);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    configurationError(["PORT must be an integer between 1 and 65535"]);
  }

  return port;
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

  return {
    port: parsePort(parsed.data.PORT),
    databaseUrl: parsed.data.DATABASE_URL,
    frontendUrls: parseFrontendUrls(parsed.data.FRONTEND_URL),
    stunUrls: parseIceUrls(
      parsed.data.STUN_SERVER_URL,
      "STUN_SERVER_URL",
      ["stun:"],
    ),
    turn: parseTurnConfig(
      parsed.data.TURN_SERVER_URL,
      parsed.data.TURN_SERVER_USERNAME,
      parsed.data.TURN_SERVER_CREDENTIAL,
    ),
  };
}
