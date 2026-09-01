import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

export async function pngIconToTelegramJpeg(pngPath: string, destPath: string): Promise<void> {
  await sharp(pngPath)
    .resize(512, 512, {
      fit: "contain",
      background: { r: 7, g: 6, b: 15, alpha: 1 },
      withoutEnlargement: false,
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(destPath);
}

export async function withTempBotProfileJpeg<T>(
  pngPath: string,
  run: (jpegPath: string, jpeg: Buffer) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "minifactory-bot-photo-"));
  const jpegPath = join(dir, "profile.jpg");
  try {
    await pngIconToTelegramJpeg(pngPath, jpegPath);
    return await run(jpegPath, readFileSync(jpegPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
