import { auth, authConfigured, providerList, signIn, signOut } from "@/auth";
import { getDb } from "@/db";
import { getBoard } from "@/server/board";
import { Board } from "@/components/Board";
import { CameraIcon } from "@/components/bits";
import { getHeroPortraits } from "@/lib/portraits";
import { visionConfigured } from "@/lib/vision";
import { SITE_URL } from "@/lib/site-url";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };

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
  const [board, portraits] = await Promise.all([
    userId ? getBoard(getDb(), userId) : Promise.resolve(null),
    getHeroPortraits(),
  ]);

  async function doSignIn(formData: FormData) {
    "use server";
    await signIn(String(formData.get("provider")), { redirectTo: "/" });
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
        syncEnabled={!!process.env.MARVEL_RIVALS_API_KEY}
      />
    </div>
  );
}
