import { loadSsmIntoEnv } from "./ssm";

/**
 * Makes sure config from SSM Parameter Store has been loaded (when SSM_PREFIX
 * is set). Awaited at the top of every code path that needs secrets or table
 * names. Loads once per server instance; a failed attempt is retried on the
 * next call rather than cached.
 *
 * Why lazy: on Amplify Hosting the compute role's credentials are only
 * available while a request is being handled, not during cold-start init, so
 * loading in instrumentation.register() fails there.
 */
let loaded = false;
let pending: Promise<void> | null = null;

export function ready(): Promise<void> {
  const prefix = process.env.SSM_PREFIX;
  if (loaded || !prefix) return Promise.resolve();
  if (!pending) {
    pending = loadSsmIntoEnv(prefix).then(
      (keys) => {
        loaded = true;
        console.log(`[config] loaded ${keys.length} parameters from SSM ${prefix}`);
      },
      (err) => {
        pending = null;
        console.error(`[config] failed to load SSM parameters from ${prefix}:`, err instanceof Error ? err.message : err);
      },
    );
  }
  return pending;
}
