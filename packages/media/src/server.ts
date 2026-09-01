import {
  MediaValidationError,
  OCR_IMAGE_LIMITS,
  defaultMediaLimits,
  isAllowedMime,
  isWithinSize,
  sniffImageMime,
  type MediaKind,
} from "./index";

export { MediaValidationError, OCR_IMAGE_LIMITS };

export function validateUploadedFile(
  file: { type: string; size: number },
  kind: MediaKind,
): void {
  const limits = defaultMediaLimits[kind];
  if (!isAllowedMime(file.type, limits.mimeTypes)) {
    throw new MediaValidationError(`Unsupported ${kind} type`, "unsupported_type");
  }
  if (!isWithinSize(file.size, limits.maxBytes)) {
    throw new MediaValidationError(`${kind} exceeds size limit`, "too_large");
  }
}

export function validateOcrImageBuffer(bytes: Uint8Array, declaredMime?: string): string {
  if (!isWithinSize(bytes.byteLength, OCR_IMAGE_LIMITS.maxBytes)) {
    throw new MediaValidationError("That image is too large. Try another photo.", "too_large");
  }
  if (bytes.byteLength < 32) {
    throw new MediaValidationError("This image format isn't supported.", "too_small");
  }
  const sniffed = sniffImageMime(bytes);
  if (!sniffed) {
    throw new MediaValidationError("This image format isn't supported.", "unsupported_type");
  }
  if (declaredMime && declaredMime !== sniffed && !(declaredMime === "image/jpg" && sniffed === "image/jpeg")) {
    throw new MediaValidationError("This image format isn't supported.", "unsupported_type");
  }
  return sniffed;
}

export function decodeBase64Image(data: string): Uint8Array {
  const trimmed = data.includes(",") ? (data.split(",").pop() ?? data) : data;
  return Uint8Array.from(Buffer.from(trimmed, "base64"));
}
