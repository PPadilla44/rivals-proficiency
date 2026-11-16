import type { ReactNode } from "react";

/**
 * Logos for the sign-in buttons. Both files are the ones the companies publish, unedited
 * (Discord's white symbol from discord.com/branding; Google's G from its sign-in asset pack, with only the
 * viewBox cropped to the G itself). Never redraw or recolor them.
 */
export function ProviderIcon({ id }: { id: string }): ReactNode {
  if (id === "discord")
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="provider-icon" src="/brand/discord-symbol-white.svg" width={24} height={18} alt="" aria-hidden="true" />;
  if (id === "google")
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="provider-icon" src="/brand/google-g.svg" width={20} height={20} alt="" aria-hidden="true" />;
  return null;
}
