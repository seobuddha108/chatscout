"use client";

import { useActionState } from "react";
import { createTrialKey, type CreateKeyState } from "./actions";

export function CreateKey() {
  const [state, action, pending] = useActionState<CreateKeyState>(createTrialKey, {});
  return (
    <form action={action}>
      <button disabled={pending}>{pending ? "Erstelle…" : "Testschlüssel erstellen (7 Tage)"}</button>
      {state.error && <p role="alert" style={{ color: "#b00020" }}>{state.error}</p>}
      {state.key && (
        <p>
          Dein Schlüssel (wird nur jetzt angezeigt):<br />
          <code style={{ userSelect: "all", background: "#f3f3f3", padding: "4px 8px", display: "inline-block" }}>{state.key}</code>
        </p>
      )}
    </form>
  );
}
