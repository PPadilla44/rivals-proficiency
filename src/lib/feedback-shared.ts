/** What the Feedback form and the server agree on. No server code here, so the browser can import it. */

export const FEEDBACK_KINDS = ["bug", "idea", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = { bug: "Bug", idea: "Idea", other: "Other" };

/** A person writes a few lines, not an essay; the ceilings stop a script from filling the table. */
export const FEEDBACK_LIMITS = { minChars: 3, maxChars: 1000, visitorPerHour: 5, sitePerHour: 60, pingPerHour: 20 };

/** Where a feedback form was opened from, for the digest's "opened by N". */
export const FEEDBACK_SOURCES = ["header", "footer", "link", "import"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

/** Buttons announce themselves on the window; one host near the top of the page opens the form. */
export const FEEDBACK_OPEN_EVENT = "pb:open-feedback";
