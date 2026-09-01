import { getLanguage } from "./languages";

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function speakText(text: string, languageCode: string): boolean {
  if (!canSpeak() || !text.trim()) {
    return false;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const preferred = getLanguage(languageCode)?.speech ?? languageCode;
  utterance.lang = preferred;
  const voices = window.speechSynthesis.getVoices();
  const match =
    voices.find((voice) => voice.lang === preferred) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(preferred.slice(0, 2).toLowerCase()));
  if (match) {
    utterance.voice = match;
  }
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (canSpeak()) {
    window.speechSynthesis.cancel();
  }
}
