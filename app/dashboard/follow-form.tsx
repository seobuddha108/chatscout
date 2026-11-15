"use client";

import { useActionState } from "react";
import { followAction } from "./actions";
import type { FollowResult } from "@/follow/follows";

export function FollowForm() {
  const [state, action, pending] = useActionState<FollowResult | null, FormData>(followAction, null);
  return (
    <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input name="handle" placeholder="@creator" required style={{ flex: "1 1 200px" }} />
      <button disabled={pending}>{pending ? "…" : "Verfolgen"}</button>
      {state && !state.ok && <span role="alert" style={{ color: "#b00020", flexBasis: "100%" }}>{state.error}</span>}
      {state?.ok && <span style={{ color: "#137333", flexBasis: "100%" }}>@{state.uniqueId} wird ab dem nächsten LIVE aufgezeichnet.</span>}
    </form>
  );
}
