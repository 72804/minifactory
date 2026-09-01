import { z } from "zod";

export const analyticsEventNameSchema = z.enum([
  "app_open",
  "first_open",
  "action_started",
  "action_completed",
  "action_failed",
  "share_clicked",
  "referral_open",
  "paywall_view",
  "product_selected",
  "invoice_created",
  "invoice_opened",
  "invoice_cancelled",
  "invoice_failed",
  "payment_pending",
  "purchase_started",
  "purchase_completed",
  "purchase_fulfillment_delayed",
  "purchased_credit_consumed",
  "pro_translation_consumed",
  "ad_impression",
  "ad_rewarded",
  "camera_permission_requested",
  "camera_permission_granted",
  "camera_permission_denied",
  "capture_started",
  "capture_completed",
  "upload_selected",
  "translation_started",
  "translation_completed",
  "translation_failed",
  "no_text_detected",
  "language_changed",
  "copy_clicked",
  "speak_clicked",
  "retake_clicked",
  "history_opened",
  "usage_limit_hit",
]);

export type AnalyticsEventName = z.infer<typeof analyticsEventNameSchema>;

export type AnalyticsMetadata = Record<string, string | number | boolean | null>;

export const trackInputSchema = z.object({
  name: analyticsEventNameSchema,
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
