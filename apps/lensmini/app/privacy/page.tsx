export default function PrivacyPage() {
  return (
    <main>
      <h1>Privacy</h1>
      <p>
        LensMini translates visible text from photographs you capture or upload inside Telegram. Those images are sent
        to our server only to validate the request and to complete the translation. LensMini does not permanently store
        captured or uploaded photographs.
      </p>
      <p>
        A third-party AI service may process the submitted image and extracted text to produce a translation. We do not
        promise that this provider never retains or trains on request data. That depends on the provider terms in
        effect when the request is made.
      </p>
      <p>
        Successful translations may be stored as text history (source language, target language, original text,
        translated text, and time) for your Telegram identity in this Mini App. You can delete individual history
        entries or clear all LensMini history from the History screen. We do not keep the photo with that history.
      </p>
      <p>
        Analytics events may record actions such as camera permission, capture, and translation success or failure.
        Those events do not include the photograph, OCR text, or translated text.
      </p>
    </main>
  );
}
