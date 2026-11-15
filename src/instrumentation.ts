/**
 * Runs once when the Next.js server starts. We try to load config from SSM
 * here as a best effort, but on Amplify the compute role's credentials are not
 * available during start-up, so the real guarantee is src/lib/config.ts:
 * every code path that needs config awaits ready() and loads lazily.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.SSM_PREFIX) return;
  const { ready } = await import("./lib/config");
  await ready();
}
