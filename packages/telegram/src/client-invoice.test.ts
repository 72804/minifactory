import { describe, expect, it } from "vitest";
import { clientInvoiceStatusMayGrant } from "./client";

describe("Telegram invoiceClosed", () => {
  it("never grants access from the Mini App client status", () => {
    expect(clientInvoiceStatusMayGrant("paid")).toBe(false);
    expect(clientInvoiceStatusMayGrant("cancelled")).toBe(false);
    expect(clientInvoiceStatusMayGrant("failed")).toBe(false);
    expect(clientInvoiceStatusMayGrant("pending")).toBe(false);
  });
});
