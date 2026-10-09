import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { events } from "@/db/schema";
import type { AnyDb } from "./board";
import { reportProblem } from "./alerts";

/** Errors Next.js throws on purpose for redirects, 404s and rendering modes. Not problems. */
const CONTROL_FLOW = /^(NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/;

function messageOf(err: unknown): { message: string; digest?: string } {
  const message = err instanceof Error ? err.message : String(err);
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  return { message, digest };
}

export function isControlFlow(err: unknown): boolean {
  const { message, digest } = messageOf(err);
  return CONTROL_FLOW.test(digest ?? "") || CONTROL_FLOW.test(message);
}

/** Called from instrumentation's onRequestError for every server error Next.js catches. */
export async function reportRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
): Promise<void> {
  if (!process.env.DATABASE_URL || isControlFlow(err)) return;
  const { message } = messageOf(err);
  // Group alerts by route so a second, different breakage still pings within the hour.
  const route = context.routePath || request.path.split("?")[0];
  await reportProblem(getDb(), "page_error", `${context.routeType} ${route}: ${message}`, { group: route });
}

/** Auth.js error types that are normal (a player cancelled, a bot poked the endpoint), not outages. */
const AUTH_NOISE = new Set(["AccessDenied", "MissingCSRF", "UnknownAction", "Verification"]);

export function authErrorInfo(error: Error): { type: string; provider: string | null; message: string } | null {
  const type = (error as Error & { type?: string }).type ?? error.name;
  const cause = (error as Error & { cause?: unknown }).cause as { err?: unknown; provider?: unknown } | undefined;
  const inner = cause?.err instanceof Error ? cause.err.message : "";
  const message = inner || error.message || type;
  if (AUTH_NOISE.has(type)) return null;
  // The player pressed Cancel on the Discord or Google consent screen.
  if (/access_denied/i.test(message) || /access_denied/i.test(error.message)) return null;
  const provider = typeof cause?.provider === "string" ? cause.provider : null;
  return { type, provider, message };
}

/** Auth.js logger.error: keep the console output for Vercel logs, and alert on real failures. */
export async function reportAuthError(error: Error): Promise<void> {
  const info = authErrorInfo(error);
  console.error(`[auth][error] ${info?.type ?? error.name}: ${info?.message ?? error.message}`);
  if (!info || !process.env.DATABASE_URL) return;
  const who = info.provider ?? "sign-in";
  await reportProblem(getDb(), "sign_in_error", `${who}, ${info.type}: ${info.message}`, {
    group: `${who}:${info.type}`,
  });
}

/** At most this many browser crashes are recorded per hour, so the endpoint can't be used to fill the table. */
export const BROWSER_ERRORS_PER_HOUR = 20;

/** A crash a visitor's browser hit (the error screen showed). Grouped per page. */
export async function reportBrowserError(db: AnyDb, message: string, path: string, now = new Date()): Promise<boolean> {
  const hour = new Date(now.getTime() - 60 * 60_000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(events)
    .where(and(eq(events.name, "problem"), gte(events.createdAt, hour), sql`${events.props}->>'kind' = 'browser_error'`));
  if (n >= BROWSER_ERRORS_PER_HOUR) return false;
  const page = (path.split("?")[0] || "/").slice(0, 24);
  await reportProblem(db, "browser_error", `${page}: ${message}`, { now, group: page });
  return true;
}
