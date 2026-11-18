import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth, authConfigured } from "@/auth";
import { isAdminEmail } from "@/lib/flags";

/** Every /stats page: per request (never prerendered), and a 404 for anyone who is not in ADMIN_EMAILS. */
export async function requireAdmin() {
  await connection();
  const session = authConfigured ? await auth() : null;
  if (!isAdminEmail(session?.user?.email)) notFound();
  return session;
}
