import type { NextConfig } from "next";

const PACKAGES = [
  "@minifactory/config",
  "@minifactory/core",
  "@minifactory/ui",
  "@minifactory/telegram",
  "@minifactory/db",
  "@minifactory/analytics",
  "@minifactory/payments",
  "@minifactory/ads",
  "@minifactory/ai",
  "@minifactory/media",
  "@minifactory/notifications",
];

export function createMiniNextConfig(overrides: NextConfig = {}): NextConfig {
  return {
    reactStrictMode: true,
    transpilePackages: PACKAGES,
    agentRules: false,
    allowedDevOrigins: ["127.0.0.1", "localhost"],
    experimental: {
      serverActions: {
        bodySizeLimit: "5mb",
      },
    },
    ...overrides,
  } as NextConfig;
}
