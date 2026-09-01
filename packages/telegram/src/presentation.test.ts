import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defineAppConfig } from "@minifactory/config";
import { pngIconToTelegramJpeg } from "./profile-photo";
import { resolveTelegramPresentation } from "./presentation";

describe("resolveTelegramPresentation", () => {
  it("uses LensMini-style telegram overrides when present", () => {
    const config = defineAppConfig({
      id: "lensmini",
      name: "LensMini",
      slug: "lensmini",
      description: "Translate text instantly with your camera.",
      botUsername: "LensMiniBot",
      productionUrl: "https://lensmini.vercel.app",
      theme: { accent: "#7c5cff", radius: "16px", fontFamily: "system-ui" },
      listing: {
        shortDescription: "Translate text instantly with your camera.",
        longDescription: "Long listing copy that is not the Telegram description.",
        category: "translation",
        keywords: [],
        tagline: "Point. Translate. Done.",
      },
      telegram: {
        botName: "LensMini",
        shortDescription: "Translate text instantly with your camera.",
        description: "Point your camera at signs, menus, labels, documents, or photos and translate the text instantly — right inside Telegram.",
        menuButtonText: "Translate",
        profileImage: "public/listing/icon.png",
        startButtonText: "📷 OPEN LENSMINI",
        startPhoto: "/telegram/lensmini-hero.png",
        commands: [
          { command: "start", description: "Open LensMini" },
          { command: "help", description: "How to use LensMini" },
          { command: "privacy", description: "Privacy information" },
        ],
      },
    });
    const resolved = resolveTelegramPresentation(config);
    expect(resolved.menuButtonText).toBe("Translate");
    expect(resolved.profileImage).toBe("public/listing/icon.png");
    expect(resolved.startPhoto).toBe("/telegram/lensmini-hero.png");
    expect(resolved.commands.map((item) => item.command)).toEqual(["start", "help", "privacy"]);
    expect(resolved.description.includes("OCR")).toBe(false);
  });
});

describe("pngIconToTelegramJpeg", () => {
  it("writes a temporary 512x512 JPEG without changing the listing PNG", () => {
    const source = join(process.cwd(), "apps/lensmini/public/listing/icon.png");
    const before = statSync(source).size;
    const dir = mkdtempSync(join(tmpdir(), "mf-jpeg-test-"));
    const dest = join(dir, "profile.jpg");
    return pngIconToTelegramJpeg(source, dest).then(async () => {
      const jpeg = readFileSync(dest);
      expect(jpeg[0]).toBe(0xff);
      expect(jpeg[1]).toBe(0xd8);
      expect(statSync(source).size).toBe(before);
      const sharp = (await import("sharp")).default;
      const meta = await sharp(dest).metadata();
      expect(meta.width).toBe(512);
      expect(meta.height).toBe(512);
      expect(meta.format).toBe("jpeg");
      rmSync(dir, { recursive: true, force: true });
    });
  });
});
