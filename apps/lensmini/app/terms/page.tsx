export default function TermsPage() {
  return (
    <main>
      <h1>Terms</h1>
      <p>
        LensMini is a Telegram Mini App that translates visible text from photos you capture or upload. It is a digital
        translation service, not a human interpreter, and it may miss, misread, or mistranslate text.
      </p>
      <p>
        Each Telegram user gets a limited number of free translations per UTC day. Unused free translations do not roll
        over. Purchased translation credits are extra translations for LensMini only. They do not expire in this
        version, are not transferable to another Telegram user or another Mini App, and are consumed after the daily
        free allowance is used up — unless LensMini Pro is active.
      </p>
      <p>
        LensMini Pro is a 30-day entitlement from the time of purchase. While Pro is active you may use up to the stated
        Pro daily limit (100 translations per UTC day). Pro is not an automatically renewing subscription and is not
        unlimited.
      </p>
      <p>
        Not every photo contains readable or translatable text. A successful provider result with no readable text may
        still count as a used translation. If our service or the translation provider fails before you receive a result,
        that attempt is not kept as a charge.
      </p>
      <p>
        Do not use LensMini to process images you are not allowed to share, to harass others, or to evade usage limits
        with automated abuse. We may refuse or reverse abusive use.
      </p>
      <p>
        For purchase questions use the /paysupport command in the LensMini bot. Telegram support cannot resolve Stars
        purchases made through LensMini. Refunds, when issued, are handled by LensMini using Telegram Stars refund
        tools — there is no in-app self-refund button.
      </p>
    </main>
  );
}
