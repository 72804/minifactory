"use client";

import { useState } from "react";
import { factoryFetch } from "@minifactory/core";
import { Button, Card, Textarea, Toast } from "@minifactory/ui";

type ProcessResponse = {
  result: string;
  usage: { remaining: number; limit: number | null };
};

export function ProcessTool() {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function onProcess() {
    setPending(true);
    setToast(null);
    try {
      const response = await factoryFetch("/api/process", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      const json = (await response.json()) as ProcessResponse & { error?: string };
      if (!response.ok) {
        setToast(json.error ?? "Processing failed");
        return;
      }
      setResult(json.result);
    } catch {
      setToast("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <label htmlFor="source">Text</label>
      <Textarea
        id="source"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Type something to transform"
      />
      <div style={{ height: 12 }} />
      <Button onClick={() => void onProcess()} disabled={pending || text.trim().length === 0}>
        {pending ? "Processing…" : "Process"}
      </Button>
      {result ? (
        <p style={{ marginBottom: 0, marginTop: 16 }}>
          <strong>Result:</strong> {result}
        </p>
      ) : null}
      <Toast message={toast} />
    </Card>
  );
}
