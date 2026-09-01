import { capabilitySchema, slugSchema } from "@minifactory/config";

export const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,46}[a-z0-9]$/;
export const ACCENT_PATTERN = /^#([0-9a-fA-F]{6})$/;
export const RESERVED_SLUGS = new Set(["admin", "template"]);

export class GeneratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratorError";
  }
}

export function assertSafeSlug(slug: string): string {
  if (slug !== slug.toLowerCase()) {
    throw new GeneratorError(`Invalid slug "${slug}". Use lowercase letters, numbers, and dashes.`);
  }
  if (slug.includes("..") || slug.includes("/") || slug.includes("\\")) {
    throw new GeneratorError("Invalid slug: path traversal is not allowed.");
  }
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) {
    throw new GeneratorError(`Invalid slug "${slug}". Use lowercase letters, numbers, and dashes.`);
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new GeneratorError(`Slug "${slug}" is reserved by the factory.`);
  }
  return slug;
}

export function assertAppName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new GeneratorError("App name cannot be empty.");
  }
  if (trimmed.length > 40) {
    throw new GeneratorError("App name must be 40 characters or fewer.");
  }
  return trimmed;
}

export function assertAccent(accent: string): string {
  if (!ACCENT_PATTERN.test(accent)) {
    throw new GeneratorError("Accent color must be a hex value like #2481cc");
  }
  return accent;
}

export function assertCapabilities(values: string[]): string[] {
  if (values.length === 0) {
    throw new GeneratorError("Select at least one capability.");
  }
  const unknown = values.filter((value) => !capabilitySchema.safeParse(value).success);
  if (unknown.length > 0) {
    throw new GeneratorError(`Unknown capability: ${unknown.join(", ")}`);
  }
  return values;
}
