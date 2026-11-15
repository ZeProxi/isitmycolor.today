import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";
import { env, awsCredentials } from "./env";

/**
 * Copies every parameter under `prefix` (e.g. "/isitmycolor") into process.env,
 * keyed by the last path segment: /isitmycolor/CRON_SECRET -> CRON_SECRET.
 * SecureStrings are decrypted. Values from SSM win over anything already set.
 */
export async function loadSsmIntoEnv(prefix: string): Promise<string[]> {
  const client = new SSMClient({ region: env.region, credentials: awsCredentials() });
  const loaded: string[] = [];
  let NextToken: string | undefined;
  do {
    const r = await client.send(
      new GetParametersByPathCommand({ Path: prefix, Recursive: true, WithDecryption: true, NextToken }),
    );
    for (const p of r.Parameters ?? []) {
      if (!p.Name || p.Value === undefined) continue;
      const key = p.Name.slice(prefix.length).replace(/^\//, "").replace(/\//g, "_");
      process.env[key] = p.Value;
      loaded.push(key);
    }
    NextToken = r.NextToken;
  } while (NextToken);
  return loaded;
}
