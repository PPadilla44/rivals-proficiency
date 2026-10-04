import { cookies } from "next/headers";
import { sessions, users } from "@/db/schema";
import type { AnyDb } from "./board";

/**
 * Preview deployments get a new URL each time, so OAuth providers reject
 * their redirect. On previews (and local dev) only, a button signs in as a
 * fresh test user instead. Never available in production.
 */
export const previewLoginEnabled =
  process.env.VERCEL_ENV === "preview" || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "development");

export const PREVIEW_PROVIDER = "preview-test";

/** Create a new test user with an empty board and a session row for it. */
export async function createPreviewSession(db: AnyDb, now = new Date()): Promise<{ token: string; expires: Date; userId: string }> {
  const userId = crypto.randomUUID();
  const tag = userId.slice(0, 6);
  await db.insert(users).values({ id: userId, name: `Test user ${tag}`, email: `test-${tag}@preview.invalid` });
  const token = crypto.randomUUID();
  const expires = new Date(now.getTime() + 7 * 86_400_000);
  await db.insert(sessions).values({ sessionToken: token, userId, expires });
  return { token, expires, userId };
}

/** Sign the browser in as a new test user. Throws outside previews and local dev. */
export async function previewSignIn(db: AnyDb): Promise<void> {
  if (!previewLoginEnabled) throw new Error("Preview sign-in is not available here.");
  const { token, expires } = await createPreviewSession(db);
  // Auth.js reads the session token from this cookie; it is prefixed on https.
  const secure = !!process.env.VERCEL;
  (await cookies()).set(`${secure ? "__Secure-" : ""}authjs.session-token`, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires,
  });
}
