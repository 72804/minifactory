import { createRequire } from "node:module";
import { readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const listingDir = join(root, "apps/lensmini/public/listing");
const MAX_BYTES = 1024 * 1024;

function loadSharp(): typeof import("sharp") {
  const pnpm = join(root, "node_modules/.pnpm");
  const match = readdirSync(pnpm).find((name) => name.startsWith("sharp@"));
  if (!match) {
    throw new Error("sharp is not installed in the workspace");
  }
  const pkg = join(pnpm, match, "node_modules/sharp/package.json");
  return createRequire(pathToFileURL(pkg).href)("sharp") as typeof import("sharp");
}

const sharp = loadSharp();

type Rgb = { r: number; g: number; b: number };

async function sampleEdge(file: string, position: "top" | "bottom"): Promise<Rgb> {
  const { width = 1, height = 1 } = await sharp(file).metadata();
  const y = position === "top" ? 0 : Math.max(0, height - 1);
  const { data } = await sharp(file)
    .extract({ left: Math.floor(width / 2), top: y, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0] ?? 7, g: data[1] ?? 6, b: data[2] ?? 15 };
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

async function canvas(width: number, height: number, top: Rgb, bottom: Rgb) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const color = mix(top, bottom, height === 1 ? 0 : y / (height - 1));
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      raw[i] = color.r;
      raw[i + 1] = color.g;
      raw[i + 2] = color.b;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png();
}

async function writeUnderLimit(pipeline: import("sharp").Sharp, dest: string): Promise<void> {
  const tmp = `${dest}.tmp`;
  const attempts: import("sharp").PngOptions[] = [
    { compressionLevel: 9, effort: 10, adaptiveFiltering: true },
    { compressionLevel: 9, effort: 10, palette: true, colours: 256, dither: 1 },
  ];
  try {
    for (const options of attempts) {
      await pipeline.clone().png(options).toFile(tmp);
      if (statSync(tmp).size < MAX_BYTES) {
        renameSync(tmp, dest);
        return;
      }
    }
    throw new Error(`${dest} could not be compressed under 1MB`);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // already renamed or never created
    }
  }
}

async function fitScreenshot(name: string) {
  const src = join(listingDir, name);
  const width = 900;
  const height = 1600;
  const [top, bottom] = await Promise.all([sampleEdge(src, "top"), sampleEdge(src, "bottom")]);
  const fitted = await sharp(src)
    .resize(width, height, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  const bg = await canvas(width, height, top, bottom);
  await writeUnderLimit(bg.composite([{ input: fitted, gravity: "centre" }]), src);
}

async function fitIcon() {
  const src = join(listingDir, "icon.png");
  await writeUnderLimit(
    sharp(src).resize(512, 512, {
      fit: "contain",
      background: { r: 7, g: 6, b: 15, alpha: 1 },
      withoutEnlargement: false,
    }),
    src,
  );
}

async function report(name: string) {
  const file = join(listingDir, name);
  const meta = await sharp(file).metadata();
  const size = statSync(file).size;
  console.log(
    `${name}\t${meta.width}x${meta.height}\t${size} bytes\t${(size / 1024 / 1024).toFixed(3)} MB`,
  );
}

async function main() {
  await fitIcon();
  for (const name of ["screenshot-1.png", "screenshot-2.png", "screenshot-3.png"] as const) {
    await fitScreenshot(name);
  }
  for (const name of ["icon.png", "screenshot-1.png", "screenshot-2.png", "screenshot-3.png"]) {
    await report(name);
  }
}

void main();
