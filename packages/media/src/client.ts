import { IMAGE_MIME_TYPES, OCR_IMAGE_LIMITS, isAllowedMime, isWithinSize } from "./index";

function pickFile(accept: string, capture?: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    if (capture) {
      input.setAttribute("capture", "environment");
    }
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
    });
    input.click();
  });
}

export async function pickImage(): Promise<File | null> {
  return pickFile("image/jpeg,image/png,image/webp");
}

export async function pickFileFromDevice(accept = "*/*"): Promise<File | null> {
  return pickFile(accept);
}

export function isCameraSupported(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

export async function accessCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/jpeg", quality);
  });
  if (!blob) {
    throw new Error("Image compression failed");
  }
  return blob;
}

function drawScaled(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxLongEdge: number,
): HTMLCanvasElement {
  const longEdge = Math.max(sourceWidth, sourceHeight);
  const scale = Math.min(1, maxLongEdge / longEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not compress image");
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function compressImage(
  file: Blob,
  maxLongEdge = OCR_IMAGE_LIMITS.maxLongEdge,
  quality = 0.86,
): Promise<Blob> {
  const type = file.type || "image/jpeg";
  if (!isAllowedMime(type, IMAGE_MIME_TYPES) && type !== "image/jpg") {
    throw new Error("Unsupported image type");
  }
  if (!isWithinSize(file.size, OCR_IMAGE_LIMITS.maxBytes * 4)) {
    throw new Error("Image is too large");
  }
  const bitmap = await createImageBitmap(file);
  const canvas = drawScaled(bitmap, bitmap.width, bitmap.height, maxLongEdge);
  bitmap.close();
  return canvasToJpeg(canvas, quality);
}

export async function captureVideoFrame(
  video: HTMLVideoElement,
  maxLongEdge = OCR_IMAGE_LIMITS.maxLongEdge,
  quality = 0.86,
): Promise<Blob> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    throw new Error("Camera frame is not ready");
  }
  const canvas = drawScaled(video, width, height, maxLongEdge);
  return canvasToJpeg(canvas, quality);
}

export async function blobToBase64(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { base64: btoa(binary), mimeType: blob.type || "image/jpeg" };
}
