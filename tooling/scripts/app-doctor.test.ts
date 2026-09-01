import { describe, expect, it } from "vitest";
import { inspectVercelJson, requiredEnvNames } from "./app-doctor.ts";

describe("app:doctor helpers", () => {
  it("requires OpenAI key names only when ai is enabled", () => {
    expect(requiredEnvNames(["telegramAuth", "database"])).not.toContain("OPENAI_API_KEY");
    expect(requiredEnvNames(["telegramAuth", "database", "ai"])).toContain("OPENAI_API_KEY");
  });

  it("rejects a public outputDirectory and requires a scoped turbo build", () => {
    const bad = inspectVercelJson(JSON.stringify({ outputDirectory: "public", buildCommand: "next build" }));
    expect(bad.publicOutput).toBe(true);
    expect(bad.scopedBuild).toBe(false);
    const good = inspectVercelJson(
      JSON.stringify({
        buildCommand: "cd ../.. && pnpm exec turbo run build --filter=@minifactory/lensmini",
        ignoreCommand: "cd ../.. && npx turbo-ignore @minifactory/lensmini",
      }),
    );
    expect(good.publicOutput).toBe(false);
    expect(good.scopedBuild).toBe(true);
    expect(good.turboIgnore).toBe(true);
  });
});
