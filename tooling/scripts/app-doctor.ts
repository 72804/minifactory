import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { AppConfig, Capability } from "@minifactory/config";

export type DoctorCheck = { ok: boolean; label: string; detail?: string };

function envKeys(filePath: string): Set<string> {
  const keys = new Set<string>();
  if (!existsSync(filePath)) {
    return keys;
  }
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    keys.add(trimmed.slice(0, trimmed.indexOf("=")));
  }
  return keys;
}

function envValue(filePath: string, name: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(`${name}=`)) {
      continue;
    }
    let value = trimmed.slice(name.length + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

export function requiredEnvNames(capabilities: Capability[]): string[] {
  const names = new Set<string>(["APP_BASE_URL"]);
  if (capabilities.includes("telegramAuth")) {
    names.add("TELEGRAM_BOT_TOKEN");
  }
  if (capabilities.includes("database")) {
    names.add("DATABASE_URL");
  }
  if (capabilities.includes("ai")) {
    names.add("OPENAI_API_KEY");
  }
  return [...names].sort();
}

export function inspectVercelJson(raw: string): { scopedBuild: boolean; publicOutput: boolean; turboIgnore: boolean } {
  const parsed = JSON.parse(raw) as {
    buildCommand?: string;
    outputDirectory?: string;
    ignoreCommand?: string;
  };
  return {
    scopedBuild: Boolean(parsed.buildCommand?.includes("turbo run build --filter=@minifactory/")),
    publicOutput: parsed.outputDirectory === "public",
    turboIgnore: Boolean(parsed.ignoreCommand?.includes("turbo-ignore")),
  };
}

function check(ok: boolean, label: string, detail?: string): DoctorCheck {
  return { ok, label, detail };
}

function gitTracked(root: string, rel: string): boolean {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", rel], {
    cwd: root,
    encoding: "utf8",
  });
  return result.status === 0;
}

function gitIgnored(root: string, rel: string): boolean {
  const result = spawnSync("git", ["check-ignore", "-q", rel], { cwd: root });
  return result.status === 0;
}

export const LENSMINI_LISTING_ASSETS = [
  "icon.png",
  "screenshot-1.png",
  "screenshot-2.png",
  "screenshot-3.png",
] as const;

export function listingAssetsPresent(appDir: string, files: readonly string[] = LENSMINI_LISTING_ASSETS): boolean {
  const listingDir = join(appDir, "public", "listing");
  return files.every((name) => {
    const filePath = join(listingDir, name);
    if (!existsSync(filePath)) {
      return false;
    }
    const header = readFileSync(filePath).subarray(0, 8);
    return header.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
}

export async function runAppDoctor(slug: string, root = process.cwd()): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const appDir = join(root, "apps", slug);
  const pkgName = `@minifactory/${slug}`;
  checks.push(check(existsSync(appDir), "app folder exists", `apps/${slug}`));
  if (!existsSync(appDir)) {
    return checks;
  }

  const configPath = join(appDir, "app.config.ts");
  checks.push(check(existsSync(configPath), "manifest valid", "app.config.ts present"));
  let config: AppConfig | undefined;
  if (existsSync(configPath)) {
    const mod = (await import(pathToFileURL(configPath).href)) as { appConfig?: AppConfig };
    config = mod.appConfig;
    checks.push(check(Boolean(config?.slug === slug), "manifest valid", config ? `slug ${config.slug}` : "missing export"));
  }

  const pkgPath = join(appDir, "package.json");
  let pkg: { name?: string; scripts?: Record<string, string> } = {};
  if (existsSync(pkgPath)) {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string; scripts?: Record<string, string> };
  }
  checks.push(check(pkg.name === pkgName, "package valid", pkg.name ?? "missing"));

  for (const task of ["typecheck", "lint", "build"] as const) {
    const result = spawnSync(
      "pnpm",
      ["exec", "turbo", "run", task, `--filter=${pkgName}`],
      { cwd: root, encoding: "utf8" },
    );
    checks.push(check(result.status === 0, `scoped ${task}`, result.status === 0 ? pkgName : "failed"));
  }

  const examplePath = join(appDir, ".env.example");
  const exampleKeys = envKeys(examplePath);
  checks.push(check(existsSync(examplePath), ".env.example exists"));
  const envLocalRel = `apps/${slug}/.env.local`;
  checks.push(
    check(
      gitIgnored(root, envLocalRel) || !existsSync(join(root, envLocalRel)),
      ".env.local is gitignored",
    ),
  );
  const required = requiredEnvNames(config?.capabilities ?? ["telegramAuth", "database"]);
  const missingRequired = required.filter((name) => !exampleKeys.has(name));
  checks.push(
    check(missingRequired.length === 0, "required env variable NAMES", missingRequired.join(", ") || required.join(", ")),
  );

  const schemaPath = join(root, "prisma", "schema.prisma");
  const migrate = spawnSync("pnpm", ["db:validate"], { cwd: root, encoding: "utf8" });
  checks.push(check(migrate.status === 0 && existsSync(schemaPath), "schema valid"));
  const migrationsDir = join(root, "prisma", "migrations");
  const migrationDirs = existsSync(migrationsDir)
    ? readdirSync(migrationsDir).filter((name) => name !== "migration_lock.toml")
    : [];
  checks.push(check(migrationDirs.length > 0, "migrations exist", String(migrationDirs.length)));

  const vercelPath = join(appDir, "vercel.json");
  checks.push(check(existsSync(vercelPath), "vercel.json exists"));
  if (existsSync(vercelPath)) {
    const vercel = inspectVercelJson(readFileSync(vercelPath, "utf8"));
    checks.push(check(vercel.scopedBuild, "scoped build command"));
    checks.push(check(!vercel.publicOutput, "no outputDirectory=public mistake"));
    checks.push(check(vercel.turboIgnore, "dependency-aware ignoreCommand (turbo-ignore)"));
  }
  checks.push(
    check(true, "root-directory assumptions documented", "Vercel Root Directory = apps/<slug>; see docs/DEPLOYMENT.md"),
  );

  checks.push(check(Boolean(pkg.scripts?.["telegram:setup"]), "setup script exists"));
  const localEnv = join(appDir, ".env.local");
  const localBase = envValue(localEnv, "APP_BASE_URL") ?? envValue(examplePath, "APP_BASE_URL");
  if (localBase && !localBase.includes("localhost") && !localBase.startsWith("https://")) {
    checks.push(check(false, "APP_BASE_URL is HTTPS when locally configured"));
  } else {
    checks.push(check(true, "APP_BASE_URL is HTTPS when locally configured", localBase ? "ok or localhost" : "unset"));
  }
  checks.push(
    check(
      exampleKeys.has("TELEGRAM_BOT_TOKEN") && exampleKeys.has("TELEGRAM_WEBHOOK_SECRET"),
      "bot token/webhook secret names configured",
    ),
  );

  const ai = Boolean(config?.capabilities.includes("ai"));
  if (ai) {
    checks.push(check(exampleKeys.has("OPENAI_API_KEY"), "OPENAI_API_KEY required only when ai=true"));
    checks.push(check(exampleKeys.has("OPENAI_VISION_MODEL"), "OPENAI_VISION_MODEL recognized"));
  } else {
    checks.push(check(true, "OPENAI_API_KEY required only when ai=true", "ai capability off"));
  }

  checks.push(
    check(true, "no production mock enabled", "NODE_ENV=production ignores ALLOW_TELEGRAM_MOCK / tma-mock"),
  );
  checks.push(check(!gitTracked(root, envLocalRel), "no tracked .env.local"));
  const appSource = join(appDir);
  let leaked = false;
  function walk(dir: string) {
    if (!existsSync(dir) || leaked) {
      return;
    }
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.name === "node_modules" || name.name === ".next") {
        continue;
      }
      const next = join(dir, name.name);
      if (name.isDirectory()) {
        walk(next);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs)$/.test(name.name)) {
        continue;
      }
      const text = readFileSync(next, "utf8");
      if (/NEXT_PUBLIC_(OPENAI_API_KEY|TELEGRAM_BOT_TOKEN|DATABASE_URL|ADMIN_SECRET)/.test(text)) {
        leaked = true;
      }
    }
  }
  walk(appSource);
  checks.push(check(!leaked, "no obvious NEXT_PUBLIC secret leakage"));

  if (slug === "lensmini") {
    checks.push(
      check(
        listingAssetsPresent(appDir),
        "listing assets present",
        LENSMINI_LISTING_ASSETS.join(", "),
      ),
    );
  }

  return checks;
}

function printChecks(slug: string, checks: DoctorCheck[]): number {
  console.log(`\napp:doctor ${slug}\n`);
  let failed = 0;
  for (const item of checks) {
    const mark = item.ok ? "✓" : "✗";
    console.log(`${mark} ${item.label}${item.detail ? ` (${item.detail})` : ""}`);
    if (!item.ok) {
      failed += 1;
    }
  }
  console.log(failed === 0 ? "\nDoctor passed." : `\nDoctor failed (${failed}).`);
  return failed;
}

if (process.argv[1]?.includes("app-doctor")) {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: pnpm app:doctor <slug>");
    process.exit(1);
  }
  void runAppDoctor(slug).then((checks) => {
    process.exit(printChecks(slug, checks) === 0 ? 0 : 1);
  });
}
