import type { NextConfig } from "next";

function toOrigin(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function toWebSocketOrigin(value: string | undefined): string | null {
  const origin = toOrigin(value);

  if (origin === null) {
    return null;
  }

  return origin.replace(/^http/, "ws");
}

function buildConnectSources(): string[] {
  const sources = new Set(["'self'"]);

  for (const value of [
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_SOCKET_URL,
  ]) {
    const origin = toOrigin(value);
    const socketOrigin = toWebSocketOrigin(value);

    if (origin !== null) {
      sources.add(origin);
    }

    if (socketOrigin !== null) {
      sources.add(socketOrigin);
    }
  }

  sources.add("http://localhost:4000");
  sources.add("ws://localhost:4000");

  return [...sources];
}

function buildContentSecurityPolicy(): string {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const scriptSources = isDevelopment
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    `connect-src ${buildConnectSources().join(" ")}`,
    "worker-src 'self' blob:",
  ].join("; ");
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self)" },
  {
    key: "Content-Security-Policy",
    value: buildContentSecurityPolicy(),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
