import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { analyzeImageStructured, createAIProvider, AI_MODELS } from "@minifactory/ai/server";
import { resetServerEnvCache } from "@minifactory/config/env";
import { visionProviderSchema } from "../lib/schema";
import { VISION_SYSTEM_PROMPT, visionUserPrompt } from "../lib/prompt";

function loadEnv(): void {
  for (const name of [".env", ".env.local", "apps/lensmini/.env.local"]) {
    if (!existsSync(name)) {
      continue;
    }
    for (const line of readFileSync(name, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      const key = trimmed.slice(0, eq);
      let value = trimmed.slice(eq + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
  resetServerEnvCache();
}

function makeTextJpeg(): string | null {
  const width = 360;
  const height = 80;
  const lines = [`P3`, `${width} ${height}`, `255`];
  const letters: Record<string, string[]> = {
    M: ["10001", "11011", "10101", "10001", "10001"],
    E: ["11111", "10000", "11110", "10000", "11111"],
    R: ["11110", "10001", "11110", "10100", "10010"],
    H: ["10001", "10001", "11111", "10001", "10001"],
    A: ["01110", "10001", "11111", "10001", "10001"],
    B: ["11110", "10001", "11110", "10001", "11110"],
    " ": ["00000", "00000", "00000", "00000", "00000"],
    D: ["11110", "10001", "10001", "10001", "11110"],
    U: ["10001", "10001", "10001", "10001", "01110"],
    N: ["10001", "11001", "10101", "10011", "10001"],
    Y: ["10001", "10001", "01110", "00100", "00100"],
  };
  const text = "MERHABA DUNYA";
  const pixels: number[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => 255));
  let x = 12;
  for (const ch of text) {
    const glyph = letters[ch] ?? letters.A;
    for (let gy = 0; gy < 5; gy += 1) {
      for (let gx = 0; gx < 5; gx += 1) {
        if ((glyph?.[gy] ?? "00000")[gx] === "1") {
          for (let yy = 0; yy < 8; yy += 1) {
            for (let xx = 0; xx < 8; xx += 1) {
              const px = x + gx * 8 + xx;
              const py = 20 + gy * 8 + yy;
              if (py < height && px < width) {
                pixels[py]![px] = 0;
              }
            }
          }
        }
      }
    }
    x += 48;
  }
  for (const row of pixels) {
    lines.push(row.flatMap((value) => [value, value, value]).join(" "));
  }
  const ppm = join(tmpdir(), "lensmini-smoke.ppm");
  const jpg = join(tmpdir(), "lensmini-smoke.jpg");
  writeFileSync(ppm, lines.join("\n"));
  const converted = spawnSync("sips", ["-s", "format", "jpeg", ppm, "--out", jpg], { encoding: "utf8" });
  if (converted.status !== 0) {
    return null;
  }
  return jpg;
}

async function main() {
  loadEnv();
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) {
    console.log("FAIL: missing_openai_key");
    process.exitCode = 1;
    return;
  }
  if (!key.startsWith("sk-") || key.length < 20) {
    console.log("FAIL: invalid_openai_key");
    process.exitCode = 1;
    return;
  }
  const jpg = makeTextJpeg();
  if (!jpg) {
    console.log("SKIPPED: could not generate a local JPEG (sips unavailable).");
    return;
  }
  const imageBase64 = readFileSync(jpg).toString("base64");
  const provider = createAIProvider("openai");
  const model = AI_MODELS.vision;
  const started = Date.now();
  const result = await analyzeImageStructured(
    {
      imageBase64,
      mimeType: "image/jpeg",
      system: VISION_SYSTEM_PROMPT,
      prompt: visionUserPrompt("en"),
    },
    visionProviderSchema,
    provider,
  );
  const latencyMs = Date.now() - started;
  const translated = result.translatedText.toUpperCase();
  const original = result.originalText.toUpperCase();
  console.log(`model=${model}`);
  console.log(`latencyMs=${latencyMs}`);
  console.log(`source=${result.sourceLanguage.code}`);
  console.log(`originalHasMerhaba=${/MERHABA/.test(original)}`);
  console.log(`translated=${result.translatedText}`);
  if (!/HELLO/.test(translated) || !/WORLD/.test(translated)) {
    console.log("FAIL: semantic HELLO WORLD not detected in translated output.");
    process.exitCode = 1;
    return;
  }
  console.log("SMOKE OK: translation included HELLO WORLD.");
}

void main().catch((error) => {
  const category =
    error && typeof error === "object" && "category" in error && typeof error.category === "string"
      ? error.category
      : "other";
  console.error(`FAIL: ${category}`);
  process.exit(1);
});
