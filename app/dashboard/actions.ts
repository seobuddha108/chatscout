"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { createApiKey, revokeApiKey } from "@/api/keys";
import { currentCreator } from "@/auth/current";

export type CreateKeyState = { key?: string; error?: string };

export async function createTrialKey(_prev: CreateKeyState): Promise<CreateKeyState> {
  const creator = await currentCreator();
  if (!creator) return { error: "Bitte melde dich erneut an." };
  const db = await getDb();
  const [active] = await db.select({ id: apiKeys.id }).from(apiKeys).where(and(
    eq(apiKeys.creatorId, creator.id), isNull(apiKeys.revokedAt), gt(apiKeys.expiresAt, new Date()),
  )).limit(1);
  if (active) return { error: "Du hast bereits einen aktiven Schlüssel. Widerrufe ihn zuerst." };
  const { key } = await createApiKey(db, { name: "Dashboard trial", plan: "trial", creator: creator.uniqueId });
  revalidatePath("/dashboard");
  return { key };
}

export async function revokeKey(formData: FormData) {
  const creator = await currentCreator();
  const id = Number(formData.get("id"));
  if (!creator || !Number.isInteger(id)) return;
  const db = await getDb();
  const [key] = await db.select({ creatorId: apiKeys.creatorId }).from(apiKeys).where(eq(apiKeys.id, id));
  if (key?.creatorId !== creator.id) return; // not yours
  await revokeApiKey(db, id);
  revalidatePath("/dashboard");
}

// --- Following -------------------------------------------------------------------------------
import { followCreator, setNoTracking, unfollowCreator, type FollowResult } from "@/follow/follows";

export async function followAction(_prev: FollowResult | null, formData: FormData): Promise<FollowResult> {
  const creator = await currentCreator();
  if (!creator) return { ok: false, error: "Bitte melde dich erneut an." };
  const res = await followCreator(await getDb(), creator.id, String(formData.get("handle") ?? ""));
  revalidatePath("/dashboard");
  return res;
}

export async function unfollowAction(formData: FormData) {
  const creator = await currentCreator();
  const id = Number(formData.get("creatorId"));
  if (!creator || !Number.isInteger(id)) return;
  await unfollowCreator(await getDb(), creator.id, id);
  revalidatePath("/dashboard");
}

export async function noTrackingAction(formData: FormData) {
  const creator = await currentCreator();
  if (!creator) return;
  await setNoTracking(await getDb(), creator.id, formData.get("noTracking") === "on");
  revalidatePath("/dashboard");
}
