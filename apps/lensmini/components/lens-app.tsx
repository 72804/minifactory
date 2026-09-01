"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@minifactory/analytics/client";
import { factoryFetch, useMiniSession } from "@minifactory/core/shell";
import {
  buildMiniAppLink,
  buildReferralStartParam,
} from "@minifactory/telegram";
import {
  accessCamera,
  blobToBase64,
  captureVideoFrame,
  compressImage,
  isCameraSupported,
  pickImage,
  stopMediaStream,
} from "@minifactory/media/client";
import {
  createBackButton,
  hapticImpact,
  hapticNotification,
  openTelegramLink,
} from "@minifactory/telegram/client";
import { BottomSheet, Button, Toast } from "@minifactory/ui";
import { appConfig } from "../app.config";
import { languageName } from "../lib/languages";
import { loadRecentTargets, loadSavedTargetLanguage, saveTargetLanguage } from "../lib/prefs";
import { canSpeak, speakText, stopSpeaking } from "../lib/speech";
import type { TranslationResult } from "../lib/schema";
import { LanguageButton, LanguagePicker } from "./language-picker";
import { reportDeviceDiag } from "../lib/diagnostics";

type Screen = "camera" | "result" | "history";
type InputMethod = "camera" | "upload";
type UsageInfo = { remaining: number; limit: number | null };

type TranslateSuccess = TranslationResult & { usage?: UsageInfo; providerMs?: number };
type TranslateFailure = {
  error: string;
  code?: string;
  usage?: UsageInfo;
  providerMs?: number;
};

type HistoryItem = {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
  createdAt: string;
};

export function LensApp() {
  const router = useRouter();
  const { session, setUsage } = useMiniSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const submittingRef = useRef(false);

  const [screen, setScreen] = useState<Screen>("camera");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [recent, setRecent] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<"denied" | "unavailable" | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"analyzing" | "translating" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const speechOk = canSpeak();

  const shareUrl = buildMiniAppLink(
    appConfig.botUsername,
    buildReferralStartParam(session.user.id),
  );

  const stopCamera = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setCameraReady(false);
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!isCameraSupported()) {
      setCameraError("unavailable");
      reportDeviceDiag("camera_permission", {
        telegramEnv: Boolean(window.Telegram?.WebApp?.initData),
        cameraApi: false,
        permission: "unavailable",
      });
      return;
    }
    void track("camera_permission_requested");
    reportDeviceDiag("camera_permission", {
      telegramEnv: Boolean(window.Telegram?.WebApp?.initData),
      cameraApi: true,
      permission: "requested",
    });
    try {
      const stream = await accessCamera();
      streamRef.current = stream;
      const settings = stream.getVideoTracks()[0]?.getSettings();
      const video = videoRef.current;
      if (video) {
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
      }
      setCameraError(null);
      setCameraReady(true);
      void track("camera_permission_granted");
      reportDeviceDiag("camera_ready", {
        telegramEnv: Boolean(window.Telegram?.WebApp?.initData),
        cameraApi: true,
        permission: "granted",
        facingMode: settings?.facingMode ?? "environment",
        captureWidth: settings?.width ?? null,
        captureHeight: settings?.height ?? null,
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setCameraError("denied");
        void track("camera_permission_denied");
        reportDeviceDiag("camera_permission", {
          telegramEnv: Boolean(window.Telegram?.WebApp?.initData),
          cameraApi: true,
          permission: "denied",
        });
      } else {
        setCameraError("unavailable");
        reportDeviceDiag("camera_permission", {
          telegramEnv: Boolean(window.Telegram?.WebApp?.initData),
          cameraApi: true,
          permission: "unavailable",
        });
      }
    }
  }, []);

  useEffect(() => {
    setTargetLanguage(loadSavedTargetLanguage(session.user.languageCode));
    setRecent(loadRecentTargets());
  }, [session.user.languageCode]);

  useEffect(() => {
    if (screen === "camera") {
      void startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    };
  }, [screen, startCamera, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    const back = createBackButton();
    if (screen === "camera") {
      back.hide();
      return;
    }
    back.show();
    const off = back.onClick(() => {
      stopSpeaking();
      setScreen("camera");
    });
    return () => {
      off();
      back.hide();
    };
  }, [screen]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function applyUsage(usage?: UsageInfo) {
    if (usage) {
      setUsage({
        allowed: usage.remaining > 0,
        remaining: usage.remaining,
        limit: usage.limit,
        reason: usage.remaining > 0 ? "ok" : "quota_exceeded",
      });
    }
  }

  async function submitImage(blob: Blob, method: InputMethod) {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setPhase("analyzing");
    hapticImpact("medium");
    const started = Date.now();
    try {
      const compressed = await compressImage(blob);
      let compressedWidth: number | null = null;
      let compressedHeight: number | null = null;
      try {
        const bitmap = await createImageBitmap(compressed);
        compressedWidth = bitmap.width;
        compressedHeight = bitmap.height;
        bitmap.close();
      } catch {
        // dimensions optional
      }
      reportDeviceDiag("capture", {
        inputMethod: method,
        compressedBytes: compressed.size,
        compressedWidth,
        compressedHeight,
        captureWidth: method === "camera" ? (videoRef.current?.videoWidth ?? null) : null,
        captureHeight: method === "camera" ? (videoRef.current?.videoHeight ?? null) : null,
      });
      const { base64, mimeType } = await blobToBase64(compressed);
      const objectUrl = URL.createObjectURL(compressed);
      setPreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return objectUrl;
      });
      setPhase("translating");
      const response = await factoryFetch("/api/translate", {
        method: "POST",
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          targetLanguage,
          sourceLanguage: "auto",
          inputMethod: method,
        }),
      });
      const payload = (await response.json()) as TranslateSuccess & TranslateFailure;
      applyUsage(payload.usage);
      reportDeviceDiag("translate_client", {
        inputMethod: method,
        mode: "vision",
        durationMs: Date.now() - started,
        providerMs: payload.providerMs ?? null,
        code: payload.code ?? (response.ok ? "ok" : "failed"),
      });
      if (response.status === 429) {
        void track("paywall_view");
        setLimitOpen(true);
        hapticNotification("warning");
        setToast(payload.error);
        return;
      }
      if (!response.ok) {
        hapticNotification("error");
        setToast(payload.error ?? "Translation failed. Try again.");
        return;
      }
      hapticNotification("success");
      setResult(payload);
      setImagePreviewOpen(true);
      setScreen("result");
    } catch {
      hapticNotification("error");
      setToast("Translation failed. Try again.");
    } finally {
      submittingRef.current = false;
      setBusy(false);
      setPhase(null);
    }
  }

  async function onCapture() {
    const video = videoRef.current;
    if (!video || busy) {
      return;
    }
    void track("capture_started", { inputMethod: "camera" });
    try {
      const frame = await captureVideoFrame(video);
      void track("capture_completed", { inputMethod: "camera" });
      await submitImage(frame, "camera");
    } catch {
      setToast("Translation failed. Try again.");
    }
  }

  async function onUpload() {
    void track("upload_selected");
    const file = await pickImage();
    if (!file) {
      return;
    }
    await submitImage(file, "upload");
  }

  async function retranslate(nextLanguage: string) {
    if (!result || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setPhase("translating");
    const started = Date.now();
    try {
      const response = await factoryFetch("/api/translate", {
        method: "POST",
        body: JSON.stringify({
          originalText: result.originalText,
          sourceLanguage: result.sourceLanguage.code,
          targetLanguage: nextLanguage,
        }),
      });
      const payload = (await response.json()) as TranslateSuccess & TranslateFailure;
      applyUsage(payload.usage);
      reportDeviceDiag("translate_client", {
        inputMethod: "camera",
        mode: "retranslate",
        durationMs: Date.now() - started,
        providerMs: payload.providerMs ?? null,
        code: payload.code ?? (response.ok ? "ok" : "failed"),
      });
      if (response.status === 429) {
        void track("paywall_view");
        setLimitOpen(true);
        setToast(payload.error);
        return;
      }
      if (!response.ok) {
        setToast(payload.error ?? "Translation failed. Try again.");
        return;
      }
      setResult(payload);
    } catch {
      setToast("Translation failed. Try again.");
    } finally {
      submittingRef.current = false;
      setBusy(false);
      setPhase(null);
    }
  }

  function onSelectLanguage(code: string) {
    const previous = targetLanguage;
    setTargetLanguage(code);
    saveTargetLanguage(code);
    setRecent(loadRecentTargets());
    setPickerOpen(false);
    if (code !== previous) {
      void track("language_changed", { targetLanguage: code });
      if (screen === "result" && result) {
        void retranslate(code);
      }
    }
  }

  async function copyText(text: string) {
    void track("copy_clicked");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("clipboard");
      }
      setToast("Copied");
    } catch {
      setToast("Copy isn’t available on this device.");
    }
  }

  function onSpeak() {
    if (!result) {
      return;
    }
    void track("speak_clicked");
    const ok = speakText(result.translatedText, result.targetLanguage.code);
    if (!ok) {
      setToast("Speech isn’t available on this device.");
    }
  }

  async function openHistory() {
    void track("history_opened");
    setScreen("history");
    try {
      const response = await factoryFetch("/api/history");
      const payload = (await response.json()) as { items?: HistoryItem[] };
      setHistory(payload.items ?? []);
    } catch {
      setToast("Could not load history");
    }
  }

  const cameraMessage =
    cameraError === "denied"
      ? "No camera access. Allow camera permission or choose a photo instead."
      : cameraError === "unavailable"
        ? "You can still upload a photo."
        : null;

  return (
    <div className="lm-app">
      {screen === "camera" ? (
        <>
          <div className="lm-toolbar">
            <LanguageButton code={targetLanguage} onClick={() => setPickerOpen(true)} />
            <button type="button" className="lm-text-btn" onClick={() => void openHistory()}>
              History
            </button>
            <button type="button" className="lm-text-btn" onClick={() => setMenuOpen(true)}>
              More
            </button>
          </div>
          <div className="lm-viewport">
            {isCameraSupported() ? (
              <video ref={videoRef} className="lm-video" autoPlay muted playsInline />
            ) : (
              <div className="lm-fallback">Upload a photo to translate</div>
            )}
            {!cameraReady && !cameraError && isCameraSupported() ? (
              <div className="lm-overlay-msg">Starting camera…</div>
            ) : null}
            {cameraMessage ? <div className="lm-overlay-msg">{cameraMessage}</div> : null}
          </div>
          <p className="lm-target-label">
            Target: <LanguageButton code={targetLanguage} onClick={() => setPickerOpen(true)} />
          </p>
          <button
            type="button"
            className="lm-shutter"
            onClick={() => void onCapture()}
            disabled={busy || !cameraReady}
            aria-label="Capture"
          />
          <div className="lm-secondary">
            <Button variant="secondary" onClick={() => void onUpload()} disabled={busy}>
              Upload Photo
            </Button>
            <Button variant="ghost" onClick={() => setPickerOpen(true)} disabled={busy}>
              Swap Language
            </Button>
          </div>
          <p className="lm-privacy">
            Photos are processed for translation and are not saved by LensMini. The AI provider may process the image
            to complete the request.
          </p>
        </>
      ) : null}

      {screen === "result" && result ? (
        <div className="lm-result">
          {previewUrl && imagePreviewOpen ? (
            <button type="button" className="lm-preview-wrap" onClick={() => setImagePreviewOpen(false)}>
              <img src={previewUrl} alt="Captured frame" className="lm-preview" />
            </button>
          ) : previewUrl ? (
            <button type="button" className="lm-text-btn" onClick={() => setImagePreviewOpen(true)}>
              Show photo
            </button>
          ) : null}
          <p className="lm-kicker">Detected: {result.sourceLanguage.name}</p>
          <p className="lm-kicker">TRANSLATION</p>
          <p className="lm-translated">{result.translatedText}</p>
          <p className="lm-kicker">ORIGINAL</p>
          <p className="lm-original">{result.originalText}</p>
          <div className="lm-actions">
            <Button onClick={() => void copyText(result.translatedText)}>Copy</Button>
            {speechOk ? <Button variant="secondary" onClick={onSpeak}>Speak</Button> : null}
            <Button
              variant="ghost"
              onClick={() => {
                void track("retake_clicked");
                stopSpeaking();
                setResult(null);
                setScreen("camera");
              }}
            >
              Retake
            </Button>
          </div>
          <p className="lm-target-label">
            Translate to <LanguageButton code={targetLanguage} onClick={() => setPickerOpen(true)} />
          </p>
        </div>
      ) : null}

      {screen === "history" ? (
        <div className="lm-history">
          <div className="lm-toolbar">
            <button type="button" className="lm-text-btn" onClick={() => setScreen("camera")}>
              Camera
            </button>
            {history.length > 0 ? (
              <button
                type="button"
                className="lm-text-btn"
                onClick={async () => {
                  await factoryFetch("/api/history", { method: "DELETE" });
                  setHistory([]);
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
          {history.length === 0 ? <p className="lm-muted">No translations yet.</p> : null}
          {history.map((item) => (
            <article key={item.id} className="lm-history-item">
              <p className="lm-kicker">
                {languageName(item.sourceLanguage)} → {languageName(item.targetLanguage)}
              </p>
              <p className="lm-translated">{item.translatedText}</p>
              <p className="lm-original">{item.originalText}</p>
              <div className="lm-actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setResult({
                      sourceLanguage: { code: item.sourceLanguage, name: languageName(item.sourceLanguage) },
                      targetLanguage: { code: item.targetLanguage, name: languageName(item.targetLanguage) },
                      originalText: item.originalText,
                      translatedText: item.translatedText,
                      blocks: [
                        {
                          originalText: item.originalText,
                          translatedText: item.translatedText,
                          boundingBox: null,
                        },
                      ],
                      confidence: null,
                    });
                    setTargetLanguage(item.targetLanguage);
                    setScreen("result");
                  }}
                >
                  Open
                </Button>
                <Button variant="ghost" onClick={() => void copyText(item.translatedText)}>
                  Copy
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await factoryFetch(`/api/history?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
                    setHistory((rows) => rows.filter((row) => row.id !== item.id));
                  }}
                >
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {busy ? (
        <div className="lm-busy" role="status">
          {phase === "analyzing" ? "Analyzing text…" : "Translating…"}
        </div>
      ) : null}

      <LanguagePicker
        open={pickerOpen}
        value={targetLanguage}
        recent={recent}
        onClose={() => setPickerOpen(false)}
        onSelect={onSelectLanguage}
      />
      <BottomSheet open={menuOpen} title="More" onClose={() => setMenuOpen(false)}>
        <Button
          onClick={() => {
            void track("share_clicked");
            openTelegramLink(shareUrl);
            setMenuOpen(false);
          }}
        >
          Share LensMini
        </Button>
        <div style={{ height: 8 }} />
        <Button variant="secondary" onClick={() => router.push("/privacy")}>
          Privacy
        </Button>
      </BottomSheet>
      <BottomSheet open={limitOpen} title="Daily limit reached" onClose={() => setLimitOpen(false)}>
        <p>You&apos;ve used today&apos;s 5 free translations.</p>
        <p className="lm-muted">More translations are coming soon.</p>
        <Button onClick={() => setLimitOpen(false)}>OK</Button>
      </BottomSheet>
      <Toast message={toast} />
    </div>
  );
}
