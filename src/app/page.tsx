import { auth, authConfigured, providerList, signIn, signOut } from "@/auth";
import { getDb } from "@/db";
import { getBoard } from "@/server/board";
import { Board } from "@/components/Board";
import { getHeroPortraits } from "@/lib/portraits";

const KOFI_URL = "https://ko-fi.com/pablopadilla";

export default async function Home() {
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
            Support on Ko-fi
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

      <Board mode={board ? "user" : "guest"} initial={board} signInSlot={signInButtons} portraits={portraits} />

      <footer className="foot">
        <span>
          54 heroes as of Season 10 (Gorr the God Butcher). A new rank every 5 levels: Lord at 20, Champion at 50, max 70.
        </span>
        <span>
          Estimates use playtime from the unofficial{" "}
          <a href="https://marvelrivalsapi.com" target="_blank" rel="noreferrer">
            MarvelRivalsAPI.com
          </a>{" "}
          and learn your pace each time you correct a level. Hero art is linked from that service. Not affiliated with NetEase or Marvel.
        </span>
        <span>
          Free and fan-made. If it saves you some clicking,{" "}
          <a href={KOFI_URL} target="_blank" rel="noreferrer">
            buy me a coffee on Ko-fi
          </a>
          .
        </span>
      </footer>
    </div>
  );
}
