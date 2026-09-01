import { factoryFetch } from "@minifactory/core/shell";

export type DeviceDiagEvent = "camera_permission" | "camera_ready" | "capture" | "translate_client";

export type DeviceDiagMeta = Record<string, string | number | boolean | null>;

export function reportDeviceDiag(event: DeviceDiagEvent, meta: DeviceDiagMeta): void {
  console.info("[lensmini]", event, meta);
  void factoryFetch("/api/mf/diagnostics", {
    method: "POST",
    body: JSON.stringify({ event, meta }),
  }).catch(() => undefined);
}
