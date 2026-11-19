import type { Instrumentation } from "next";

/**
 * Config from SSM is not loaded here. On Amplify the compute role's credentials
 * are not available while the server starts, so an attempt at start-up fails
 * every time; src/lib/config.ts loads it on the first request that needs it.
 */

/**
 * Called by Next.js for any error a page or route didn't handle itself. Without
 * this, the visitor sees an error page and the log says nothing about which page.
 * The path is logged without its query string, which can carry sign-in or
 * unsubscribe tokens.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log, reason } = await import("./lib/log");
  log.error("unhandled", {
    path: request.path.split("?")[0],
    method: request.method,
    route: context.routePath,
    kind: context.routeType,
    digest: typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined,
    err: reason(err),
  });
};
