"use client";

import { useMemo, useState } from "react";
import { BottomSheet, Button, Input } from "@minifactory/ui";
import { languagesForPicker } from "../lib/prefs";
import { languageName } from "../lib/languages";

export function LanguagePicker({
  open,
  value,
  recent,
  onClose,
  onSelect,
}: {
  open: boolean;
  value: string;
  recent: string[];
  onClose: () => void;
  onSelect: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const lists = useMemo(() => languagesForPicker(query, recent), [query, recent]);

  return (
    <BottomSheet open={open} title="Translate to" onClose={onClose}>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search language"
        autoFocus
        aria-label="Search language"
      />
      {lists.recent.length > 0 ? (
        <div className="lm-lang-section">
          <p className="lm-kicker">Recent</p>
          {lists.recent.map((language) => (
            <button
              key={`recent-${language.code}`}
              type="button"
              className={`lm-lang-row${language.code === value ? " is-active" : ""}`}
              onClick={() => {
                onSelect(language.code);
                setQuery("");
              }}
            >
              {language.name}
              <span>{language.code}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="lm-lang-list">
        {lists.all.map((language) => (
          <button
            key={language.code}
            type="button"
            className={`lm-lang-row${language.code === value ? " is-active" : ""}`}
            onClick={() => {
              onSelect(language.code);
              setQuery("");
            }}
          >
            {language.name}
            <span>{language.code}</span>
          </button>
        ))}
      </div>
      <div style={{ height: 8 }} />
      <Button variant="secondary" onClick={onClose}>
        Close
      </Button>
    </BottomSheet>
  );
}

export function LanguageButton({
  code,
  onClick,
}: {
  code: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="lm-lang-btn" onClick={onClick}>
      {languageName(code)} ▼
    </button>
  );
}
