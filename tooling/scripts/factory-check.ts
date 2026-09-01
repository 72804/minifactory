import { spawnSync } from "node:child_process";

const steps: Array<[string, string[]]> = [
  ["Workspace", ["pnpm", "ls", "-r", "--depth", "-1"]],
  ["Prisma validate", ["pnpm", "db:validate"]],
  ["Prisma generate", ["pnpm", "db:generate"]],
  ["Typecheck", ["pnpm", "typecheck"]],
  ["Lint", ["pnpm", "lint"]],
  ["Build", ["pnpm", "build"]],
  ["Unit tests", ["pnpm", "test"]],
];

function run(label: string, command: string[]) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command[0]!, command.slice(1), { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`factory:check failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

for (const [label, command] of steps) {
  run(label, command);
}

console.log("\nFactory is healthy.");
