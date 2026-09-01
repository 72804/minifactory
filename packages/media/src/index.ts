export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "application/json",
] as const;
export const AUDIO_MIME_TYPES = ["audio/mpeg", "audio/wav", "audio/webm", "audio/ogg"] as const;

export type MediaKind = "image" | "document" | "audio" | "video";

export type MediaValidation = {
  maxBytes: number;
  mimeTypes: readonly string[];
};

export const defaultMediaLimits: Record<MediaKind, MediaValidation> = {
  image: { maxBytes: 4 * 1024 * 1024, mimeTypes: IMAGE_MIME_TYPES },
  document: { maxBytes: 12 * 1024 * 1024, mimeTypes: DOCUMENT_MIME_TYPES },
  audio: { maxBytes: 12 * 1024 * 1024, mimeTypes: AUDIO_MIME_TYPES },
  video: { maxBytes: 32 * 1024 * 1024, mimeTypes: ["video/mp4", "video/webm"] },
};

export const OCR_IMAGE_LIMITS = {
  maxBytes: 4 * 1024 * 1024,
  maxLongEdge: 2000,
  minLongEdge: 48,
  mimeTypes: IMAGE_MIME_TYPES,
} as const;

export function isAllowedMime(mimeType: string, allowed: readonly string[]): boolean {
  return allowed.includes(mimeType);
}

export function isWithinSize(byteLength: number, maxBytes: number): boolean {
  return byteLength > 0 && byteLength <= maxBytes;
}

export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export class MediaValidationError extends Error {
  constructor(
    message: string,
    public code: "unsupported_type" | "too_large" | "too_small",
  ) {
    super(message);
    this.name = "MediaValidationError";
  }
}
