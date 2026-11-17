/**
 * Creates (or updates) the EventBridge rule that calls the deployed site's
 * /api/cron/notify endpoint. Run once after the site has a public URL.
 *
 *   npx tsx scripts/create-schedule.ts https://isitmycolor.today
 *
 * Schedule: every 20 minutes, 06:00-00:40 UTC, which covers midnight through
 * about 5 pm Mountain time in both MST and MDT (wider in one of them, harmless).
 * The page resets at midnight, so the first runs capture the new day for the
 * history calendar; running into the afternoon means a color added late is
 * still noticed and people are told. Each person picks an earliest text hour (1 am-12 pm, default 6 am),
 * texts go at most once per subscriber per day, and the global
 * NOTIFY_START_HOUR..NOTIFY_END_HOUR window still applies, so extra runs are harmless.
 *
 * EventBridge calls a public HTTPS endpoint through an "API destination". That needs:
 * a Connection (holds the Authorization header), an ApiDestination, an IAM role
 * EventBridge assumes, and the Rule + Target. This script creates all of them.
 * (EventBridge *Scheduler* rejects API-destination ARNs as targets, so a classic
 * rule with a UTC cron is used instead.)
 */
import "dotenv/config";
import {
  EventBridgeClient,
  CreateConnectionCommand,
  DescribeConnectionCommand,
  UpdateConnectionCommand,
  CreateApiDestinationCommand,
  DescribeApiDestinationCommand,
  UpdateApiDestinationCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  IAMClient,
  CreateRoleCommand,
  GetRoleCommand,
  PutRolePolicyCommand,
  UpdateAssumeRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { env, awsCredentials } from "../src/lib/env";

const NAME = "wasatch-colors-notify";
const ROLE_NAME = `${NAME}-scheduler-role`;
const CRON_UTC = "cron(0/20 0,6-23 * * ? *)";

const siteUrl = process.argv[2]?.replace(/\/$/, "");
if (!siteUrl || !siteUrl.startsWith("https://")) {
  console.error("usage: npx tsx scripts/create-schedule.ts https://your-site.example");
  process.exit(1);
}
if (!env.cronSecret) {
  console.error("CRON_SECRET is not set in .env");
  process.exit(1);
}

const creds = awsCredentials();
const eb = new EventBridgeClient({ region: env.region, credentials: creds });
const iam = new IAMClient({ region: env.region, credentials: creds });

const TRUST = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: ["events.amazonaws.com", "scheduler.amazonaws.com"] },
      Action: "sts:AssumeRole",
    },
  ],
});

async function ensureConnection(): Promise<string> {
  const auth = {
    ApiKeyAuthParameters: { ApiKeyName: "Authorization", ApiKeyValue: `Bearer ${env.cronSecret}` },
  };
  try {
    const r = await eb.send(new DescribeConnectionCommand({ Name: NAME }));
    await eb.send(new UpdateConnectionCommand({ Name: NAME, AuthorizationType: "API_KEY", AuthParameters: auth }));
    console.log("✓ connection updated");
    return r.ConnectionArn!;
  } catch {
    const r = await eb.send(
      new CreateConnectionCommand({ Name: NAME, AuthorizationType: "API_KEY", AuthParameters: auth }),
    );
    console.log("✓ connection created");
    return r.ConnectionArn!;
  }
}

async function ensureDestination(connectionArn: string): Promise<string> {
  const endpoint = `${siteUrl}/api/cron/notify`;
  try {
    const r = await eb.send(new DescribeApiDestinationCommand({ Name: NAME }));
    await eb.send(
      new UpdateApiDestinationCommand({ Name: NAME, ConnectionArn: connectionArn, InvocationEndpoint: endpoint, HttpMethod: "POST" }),
    );
    console.log(`✓ api destination updated -> ${endpoint}`);
    return r.ApiDestinationArn!;
  } catch {
    const r = await eb.send(
      new CreateApiDestinationCommand({
        Name: NAME,
        ConnectionArn: connectionArn,
        InvocationEndpoint: endpoint,
        HttpMethod: "POST",
        InvocationRateLimitPerSecond: 1,
      }),
    );
    console.log(`✓ api destination created -> ${endpoint}`);
    return r.ApiDestinationArn!;
  }
}

async function ensureRole(destinationArn: string): Promise<string> {
  let arn: string;
  try {
    arn = (await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }))).Role!.Arn!;
    await iam.send(new UpdateAssumeRolePolicyCommand({ RoleName: ROLE_NAME, PolicyDocument: TRUST }));
    console.log("✓ role exists");
  } catch {
    arn = (await iam.send(new CreateRoleCommand({ RoleName: ROLE_NAME, AssumeRolePolicyDocument: TRUST }))).Role!.Arn!;
    console.log("✓ role created (IAM propagation can take ~10s)");
    await new Promise((r) => setTimeout(r, 12000));
  }
  await iam.send(
    new PutRolePolicyCommand({
      RoleName: ROLE_NAME,
      PolicyName: "invoke-api-destination",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Action: "events:InvokeApiDestination", Resource: destinationArn }],
      }),
    }),
  );
  return arn;
}

async function ensureRule(destinationArn: string, roleArn: string) {
  await eb.send(
    new PutRuleCommand({
      Name: NAME,
      ScheduleExpression: CRON_UTC,
      State: "ENABLED",
      Description: "Scrape wasatch.org/colors and alert subscribers (midnight to about 5 pm Mountain, expressed in UTC)",
    }),
  );
  const r = await eb.send(
    new PutTargetsCommand({
      Rule: NAME,
      Targets: [{ Id: "notify", Arn: destinationArn, RoleArn: roleArn, Input: "{}" }],
    }),
  );
  if (r.FailedEntryCount) throw new Error(`target failed: ${JSON.stringify(r.FailedEntries)}`);
  console.log(`✓ rule ${NAME} set: ${CRON_UTC}`);
}

async function main() {
  console.log(`region: ${env.region}`);
  const conn = await ensureConnection();
  const dest = await ensureDestination(conn);
  const role = await ensureRole(dest);
  await ensureRule(dest, role);
  console.log("done. Runs every 20 min, 06:00-00:40 UTC (midnight through about 5 pm Mountain).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
