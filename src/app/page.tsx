import { auth, authConfigured, providerList, signIn, signOut } from "@/auth";
import { getDb } from "@/db";
import { getBoard } from "@/server/board";
import { Board } from "@/components/Board";
import { CameraIcon } from "@/components/bits";
import { getHeroPortraits } from "@/lib/portraits";
import { KOFI_URL } from "@/lib/site";
import { visionConfigured } from "@/lib/vision";
import { SITE_URL } from "@/lib/site-url";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Proficiency Board",
  alternateName: "Marvel Rivals Proficiency Tracker",
  url: SITE_URL,
  applicationCategory: "GameApplication",
  operatingSystem: "Any",
  description:
    "Track every Marvel Rivals hero's proficiency rank and level on one screen, see who is closest to Lord and Champion, and import ranks from a screenshot.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const deleted = (await searchParams).deleted === "1";
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

  // Guests see the import too, as a button that signs them in first.
  const importSignIn =
    authConfigured && visionConfigured && providerList[0] ? (
      <form action={doSignIn} className="shot-bar">
        <button className="btn primary" name="provider" value={providerList[0].id}>
          <CameraIcon />
          Sign in to import from a screenshot
        </button>
        <span>Snap the in-game Heroes tab and every rank fills in.</span>
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
          <h1 className="logo">
            <span className="logo-a">Proficiency</span>
            <span className="logo-b">Board</span>
          </h1>
          <p className="sub">
            Every Marvel Rivals hero&apos;s proficiency on one screen. Set a level once, bump it after a session.{" "}
            <Link href="/ranks">How ranks and points work</Link>.
          </p>
        </div>
        <div className="top-actions">
          <a className="kofi" href={KOFI_URL} target="_blank" rel="noreferrer" aria-label="Support on Ko-fi">
            <span aria-hidden="true">&#9829;</span>
            <span className="kofi-label">Support on Ko-fi</span>
          </a>
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
        </div>
      </header>

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
