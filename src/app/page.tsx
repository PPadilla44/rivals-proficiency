import { auth, authConfigured, providerList, signIn, signOut } from "@/auth";
import { getDb } from "@/db";
import { getBoard } from "@/server/board";
import { PREVIEW_PROVIDER, previewLoginEnabled, previewSignIn } from "@/server/preview-login";
import { Board } from "@/components/Board";
import { CameraIcon } from "@/components/bits";
import { PreviewTools } from "@/components/PreviewTools";
import { getHeroPortraits } from "@/lib/portraits";
import { visionConfigured } from "@/lib/vision";
import { playtimeSyncEnabled } from "@/lib/flags";
import { exampleBoardMode, playtimeSyncFlag } from "@/flags";
import { SITE_URL } from "@/lib/site-url";
import { DATA_CHECKED, DATA_CHECKED_TEXT, DATA_SEASON } from "@/lib/site";
import { HEROES } from "@/lib/heroes";
import { CHAMPION, DEFAULT_POINTS_PER_HOUR, LORD, MAX_LEVEL, pointsBetween } from "@/lib/proficiency";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const fmt = (n: number) => n.toLocaleString("en-US");
const TO_LORD = pointsBetween(1, LORD);

// Plain answers to what people search for. Shown under the board and sent as FAQPage data,
// which search engines and AI answer tools read.
const FAQ: { q: string; a: string; link?: { href: string; label: string } }[] = [
  {
    q: "How do I check my hero proficiency in Marvel Rivals?",
    a: "Open a hero's Hero Profile and choose the Proficiency tab. It shows that hero's rank, level and the points toward the next level, but only one hero at a time. Proficiency Board puts all your heroes on one screen so you can see who is closest to Lord or Champion.",
  },
  {
    q: "How long does it take to get Lord?",
    a: `Lord is level ${LORD} and takes ${fmt(TO_LORD)} proficiency points, about ${Math.round(TO_LORD / DEFAULT_POINTS_PER_HOUR)} hours of play on one hero. Champion is level ${CHAMPION} and takes about ${Math.round(pointsBetween(1, CHAMPION) / DEFAULT_POINTS_PER_HOUR)} hours. The calculator works it out from any level.`,
    link: { href: "/calculator", label: "Open the proficiency calculator" },
  },
  {
    q: "What are the proficiency ranks?",
    a: `Eleven ranks, a new one every 5 levels: Agent, Knight, Captain, Centurion, Lord at ${LORD}, Count, Colonel, Warrior, Elite, Guardian and Champion from ${CHAMPION} to the max of ${MAX_LEVEL}. Levels along the way unlock rewards such as titles, nameplates, the Lord avatar and currency.`,
    link: { href: "/ranks", label: "See every rank and reward" },
  },
  {
    q: "Do I need an account or my game login?",
    a: "No. Type your levels and the board saves them in your browser. Signing in with Discord or Google keeps your board on every device and lets you fill in ranks from screenshots of the in-game Heroes tab. The site never asks for your game account or password.",
  },
  {
    q: "Is Proficiency Board official?",
    a: "No. It is a free tool made by a fan and is not affiliated with NetEase Games or Marvel.",
  },
];

// Structured data: the WebSite entry is what Google uses for the site name
// shown in results; the WebApplication entry describes the tool itself.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Proficiency Board",
      alternateName: ["Rivals Proficiency", "Rivals Proficiency Tracker", "Marvel Rivals Proficiency Tracker"],
      url: `${SITE_URL}/`,
    },
    {
      "@type": "WebApplication",
      name: "Proficiency Board",
      alternateName: "Marvel Rivals Proficiency Tracker",
      url: `${SITE_URL}/`,
      applicationCategory: "GameApplication",
      operatingSystem: "Any",
      description:
        "Track every Marvel Rivals hero's proficiency rank and level on one screen, see who is closest to Lord and Champion, and import ranks from Heroes tab screenshots.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      dateModified: DATA_CHECKED,
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ],
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const deleted = params.deleted === "1";
  // Auth.js sends sign-in failures back here (pages.error in auth.ts).
  const authError = typeof params.error === "string" ? params.error : null;
  const session = authConfigured ? await auth() : null;
  const userId = session?.user?.id;
  const [board, portraits, syncEnabled] = await Promise.all([
    userId ? getBoard(getDb(), userId) : Promise.resolve(null),
    getHeroPortraits(),
    playtimeSyncEnabled(session?.user, () => playtimeSyncFlag()),
  ]);

  // Only an untouched board can show the example, so skip the flag lookup for everyone else.
  const exampleMode = board && Object.keys(board.levels).length ? "off" : await exampleBoardMode();

  async function doSignIn(formData: FormData) {
    "use server";
    const provider = String(formData.get("provider"));
    if (provider === PREVIEW_PROVIDER) {
      if (!previewLoginEnabled) notFound();
      await previewSignIn(getDb());
      redirect("/");
    }
    await signIn(provider, { redirectTo: "/" });
  }
  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  // Guests see the import as a sign-in button. With several providers the
  // guest banner's buttons already say it, so this would only repeat them.
  const importSignIn =
    authConfigured && visionConfigured && providerList.length === 1 ? (
      <form action={doSignIn} className="shot-bar">
        <button className="btn primary" name="provider" value={providerList[0].id}>
          <CameraIcon />
          Sign in to import from screenshots
        </button>
        <span>Screenshot each page of the in-game Heroes tab and every rank fills in.</span>
      </form>
    ) : null;

  const signInButtons = authConfigured ? (
    <form action={doSignIn} className="actions">
      {providerList.map((p) => (
        <button key={p.id} className="btn primary" name="provider" value={p.id}>
          Sign in with {p.name}
        </button>
      ))}
      {previewLoginEnabled ? (
        <button className="btn" name="provider" value={PREVIEW_PROVIDER} title="Only on preview deployments">
          Sign in as test user
        </button>
      ) : null}
    </form>
  ) : null;

  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      <header className="top">
        <div>
          <h1 className="page-title">Marvel Rivals proficiency tracker</h1>
          <p className="sub">
            Every hero&apos;s rank and level on one board. Set a level once, bump it after a session.{" "}
            <Link href="/ranks">How ranks and points work</Link>.
          </p>
        </div>
        {session?.user ? (
          <div className="who">
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="" />
            ) : null}
            <span>{session.user.name ?? "Signed in"}</span>
            <form action={doSignOut}>
              <button className="btn small">Sign out</button>
            </form>
          </div>
        ) : null}
      </header>

      {authError ? (
        <div className="banner" role="alert">
          <p>
            {authError === "OAuthAccountNotLinked" ? (
              <>
                <strong>That email already has a board.</strong> Sign in with the account you used first (Discord or
                Google) to open it.
              </>
            ) : (
              <>
                <strong>Sign-in didn&apos;t finish.</strong> Try again, or use the other sign-in option.
              </>
            )}
          </p>
        </div>
      ) : null}

      {deleted ? (
        <div className="banner" role="status">
          <p>
            <strong>Your account and all of its data were deleted.</strong> You can keep using the board as a guest.
          </p>
        </div>
      ) : null}

      <Board mode={board ? "user" : "guest"} initial={board} signInSlot={signInButtons} portraits={portraits}
        screenshotImport={visionConfigured}
        importSignIn={importSignIn}
        syncEnabled={syncEnabled}
        exampleMode={exampleMode}
      />
      {previewLoginEnabled ? <PreviewTools /> : null}

      <section className="panel prose home-about" aria-labelledby="about-title">
        <h2 id="about-title">About this tracker</h2>
        <p>
          Marvel Rivals tracks proficiency separately for each of its {HEROES.length} heroes, and the game only shows one
          hero&apos;s level at a time. Proficiency Board lists them all, sorts them by who is closest to Lord or Champion,
          and shows the hours of play left. Data checked against the game on {DATA_CHECKED_TEXT} ({DATA_SEASON}).
        </p>
        {FAQ.map((f) => (
          <div key={f.q} className="faq">
            <h3>{f.q}</h3>
            <p>
              {f.a}
              {f.link ? (
                <>
                  {" "}
                  <Link href={f.link.href}>{f.link.label}</Link>.
                </>
              ) : null}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
