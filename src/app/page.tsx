import { auth, providerList, signIn, signOut } from "@/auth";
import { getDb } from "@/db";
import { getBoard } from "@/server/board";
import { Board } from "@/components/Board";

export default async function Home() {
  const session = await auth();
  const userId = session?.user?.id;
  const board = userId ? await getBoard(getDb(), userId) : null;

  async function doSignIn(formData: FormData) {
    "use server";
    await signIn(String(formData.get("provider")), { redirectTo: "/" });
  }
  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  const signInButtons = providerList.length ? (
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
          <h1>
            Proficiency <span>Board</span>
          </h1>
          <p className="sub">Every Marvel Rivals hero on one screen. Set a level once, bump it after a session.</p>
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

      <Board mode={board ? "user" : "guest"} initial={board} signInSlot={signInButtons} />

      <footer className="foot">
        <span>
          54 heroes as of Season 10 (Gorr the God Butcher). A new rank every 5 levels: Lord at 20, Champion at 50, max 70.
        </span>
        <span>
          Estimates use playtime from the unofficial{" "}
          <a href="https://marvelrivalsapi.com" target="_blank" rel="noreferrer">
            MarvelRivalsAPI.com
          </a>{" "}
          and learn your pace each time you correct a level. Not affiliated with NetEase or Marvel.
        </span>
      </footer>
    </div>
  );
}
