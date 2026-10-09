import type { Instrumentation } from "next";

/**
 * Every server error Next.js catches (page renders, API routes, server
 * actions) goes to the alert channel, at most once an hour per route.
 * Sign-in errors are handled by Auth.js itself and reported from auth.ts.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { reportRequestError } = await import("./server/report-error");
    await reportRequestError(err, request, context);
  } catch (e) {
    console.error("onRequestError report failed", e);
  }
};
