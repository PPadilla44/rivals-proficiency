export const SIGNIN_OPEN_EVENT = "pb:signin";

/**
 * Open the sign-in dialog. It lives on the home page (where the server-rendered sign-in form is),
 * so from any other page this goes there first with ?signin=1.
 */
export function openSignIn(): void {
  try {
    if (window.location.pathname === "/") window.dispatchEvent(new Event(SIGNIN_OPEN_EVENT));
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full page load on purpose
    else window.location.href = "/?signin=1";
  } catch {}
}
