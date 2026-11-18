import { afterEach, describe, expect, it, vi } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { getSearchDaily, getSearchReport, searchLines, searchSection, signJwt } from "@/server/search-console";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const key = { client_email: "digest@example.iam.gserviceaccount.com", private_key: pem };
const now = new Date("2026-10-06T14:20:00Z");

afterEach(() => vi.unstubAllEnvs());

/** A stand-in for Google: a token, one matching property, then canned query answers. */
function fakeGoogle(seen: { url: string; body: unknown }[] = []) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    seen.push({ url, body });
    const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (url.includes("oauth2.googleapis.com")) return ok({ access_token: "tok" });
    if (url.endsWith("/sites")) return ok({ siteEntry: [{ siteUrl: "https://other.example/" }, { siteUrl: "sc-domain:rivalsproficiency.com" }] });
    const dims = (body?.dimensions ?? []) as string[];
    if (dims[0] === "query")
      return ok({ rows: [{ keys: ["marvel rivals proficiency tracker"], clicks: 30, impressions: 90, position: 4.23 }] });
    if (dims[0] === "page")
      return ok({
        rows: [
          { keys: ["https://rivalsproficiency.com/"], clicks: 40, impressions: 250, position: 6 },
          { keys: ["https://rivalsproficiency.com/ranks"], clicks: 2, impressions: 60, position: 12 },
        ],
      });
    return ok(body?.startDate === "2026-09-29" ? { rows: [{ clicks: 42, impressions: 310, position: 7.14 }] } : {});
  }) as typeof fetch;
}

describe("search console", () => {
  it("signs a request Google can verify", () => {
    const [head, claims, sig] = signJwt(key, now).split(".");
    expect(createVerify("RSA-SHA256").update(`${head}.${claims}`).verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
    const c = JSON.parse(Buffer.from(claims, "base64url").toString());
    expect(c.iss).toBe(key.client_email);
    expect(c.scope).toContain("webmasters.readonly");
    expect(c.exp - c.iat).toBe(600);
  });

  it("reads the last 7 days ending yesterday next to the 7 before", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify(key));
    const seen: { url: string; body: unknown }[] = [];
    const r = await getSearchReport({ now, fetchFn: fakeGoogle(seen) });
    expect([r.from, r.to]).toEqual(["2026-09-29", "2026-10-05"]);
    expect(r.now).toEqual({ clicks: 42, impressions: 310, position: 7.14 });
    expect(r.before).toEqual({ clicks: 0, impressions: 0, position: null });
    expect(r.pages.map((p) => p.path)).toEqual(["/", "/ranks"]);
    expect(seen.some((s) => s.url.includes(encodeURIComponent("sc-domain:rivalsproficiency.com")))).toBe(true);

    expect(searchLines(r)).toEqual([
      "**Google Search** · 7 days, Sep 29 to Oct 5 (previous 7 days in brackets)",
      "Clicks 42 (0) · shown 310 times (0) · average position 7.1",
      '• "marvel rivals proficiency tracker": 30 clicks of 90, position 4.2',
      "Pages (average position in brackets): / 40 of 250 (6.0), /ranks 2 of 60 (12.0)",
    ]);
  });

  it("reads clicks per day, oldest first, and asks for the date dimension", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify(key));
    const seen: { url: string; body: unknown }[] = [];
    const base = fakeGoogle(seen);
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      if (body?.dimensions?.[0] === "date") {
        seen.push({ url: String(input), body });
        return new Response(
          JSON.stringify({ rows: [{ keys: ["2026-10-04"], clicks: 5, impressions: 40 }, { keys: ["2026-10-03"], clicks: 3, impressions: 30 }] }),
          { status: 200 },
        );
      }
      return base(input, init);
    }) as typeof fetch;
    const days = await getSearchDaily({ now, fetchFn, days: 7 });
    expect(days).toEqual([
      { day: "2026-10-03", clicks: 3, impressions: 30 },
      { day: "2026-10-04", clicks: 5, impressions: 40 },
    ]);
    const q = seen.find((x) => (x.body as { dimensions?: string[] } | null)?.dimensions?.[0] === "date")!.body as { startDate: string; endDate: string };
    expect([q.startDate, q.endDate]).toEqual(["2026-09-29", "2026-10-05"]);
  });

  it("is left out when not set up, and reports a failure in one line", async () => {
    expect(await searchSection({ now })).toEqual([]);
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify(key));
    const failing = (async () => new Response("nope", { status: 403 })) as typeof fetch;
    const lines = await searchSection({ now, fetchFn: failing });
    expect(lines[0]).toBe("**Google Search**");
    expect(lines[1]).toContain("Could not be read today");
    // The key itself must never appear in the message.
    expect(lines.join(" ")).not.toContain("PRIVATE KEY");
  });

  it("tries a stalled or failing request once more, but not a refusal", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify(key));

    // Every request fails once (a timeout, then a 503), and works the second time.
    const calls = new Map<string, number>();
    const good = fakeGoogle();
    const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const id = `${String(input)} ${typeof init?.body === "string" ? init.body : ""}`;
      const n = (calls.get(id) ?? 0) + 1;
      calls.set(id, n);
      if (n === 1) {
        if (calls.size % 2) throw new DOMException("timed out", "TimeoutError");
        return new Response("busy", { status: 503 });
      }
      return good(input, init);
    }) as typeof fetch;
    const lines = await searchSection({ now, fetchFn: flaky, retryDelayMs: 0 });
    expect(lines[0]).toContain("Google Search");
    expect(lines[1]).toContain("Clicks 42");

    // A refusal (wrong key, no access) is final: one attempt, no repeat.
    let tries = 0;
    const refused = (async () => {
      tries++;
      return new Response("nope", { status: 403 });
    }) as typeof fetch;
    const failed = await searchSection({ now, fetchFn: refused, retryDelayMs: 0 });
    expect(failed[1]).toContain("Could not be read today");
    expect(tries).toBe(1);

    // Two failures in a row still end as the one-line note, not a crash.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const down = (async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as typeof fetch;
    const gone = await searchSection({ now, fetchFn: down, retryDelayMs: 0 });
    expect(gone[1]).toContain("Could not be read today");
    quiet.mockRestore();
  });
});
