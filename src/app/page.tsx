import { auth, authConfigured, providerList, signIn, signOut } from "@/auth";
import { getDb } from "@/db";
import { getBoard } from "@/server/board";
import { Board } from "@/components/Board";
import { getHeroPortraits } from "@/lib/portraits";
import { KOFI_URL } from "@/lib/site";

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
      <header className="top">
        <div>
          <h1 className="logo">
            <span className="logo-a">Proficiency</span>
            <span className="logo-b">Board</span>
          </h1>
          <p className="sub">Every Marvel Rivals hero on one screen. Set a level once, bump it after a session.</p>
        </div>
        <div className="top-actions">
          <a className="kofi" href={KOFI_URL} target="_blank" rel="noreferrer">
            <span aria-hidden="true">&#9829;</span> Support on Ko-fi
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

      <Board mode={board ? "user" : "guest"} initial={board} signInSlot={signInButtons} portraits={portraits} />
    </div>
  );
}
