/**
 * One-time setup: creates the two DynamoDB tables (on-demand billing).
 *   npx tsx scripts/create-tables.ts
 */
import "dotenv/config";
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  UpdateTimeToLiveCommand,
  ResourceNotFoundException,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { env, awsCredentials } from "../src/lib/env";

const client = new DynamoDBClient({ region: env.region, credentials: awsCredentials() });

async function ensure(name: string, keys: { name: string; type: "HASH" | "RANGE" }[]) {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    console.log(`✓ ${name} already exists`);
    return;
  } catch (e) {
    if (!(e instanceof ResourceNotFoundException)) throw e;
  }
  console.log(`creating ${name} ...`);
  await client.send(
    new CreateTableCommand({
      TableName: name,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: keys.map((k) => ({ AttributeName: k.name, AttributeType: "S" })),
      KeySchema: keys.map((k) => ({ AttributeName: k.name, KeyType: k.type })),
      Tags: [{ Key: "app", Value: "wasatch-colors" }],
    }),
  );
  await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: name });
  console.log(`✓ ${name} created`);
}

/** Rows with a numeric `ttl` (rate-limit counters, per-person alert logs) expire on their own. */
async function enableTtl(name: string) {
  const d = await client.send(new DescribeTimeToLiveCommand({ TableName: name }));
  const status = d.TimeToLiveDescription?.TimeToLiveStatus;
  if (status === "ENABLED" || status === "ENABLING") return console.log(`✓ ${name} TTL on`);
  await client.send(new UpdateTimeToLiveCommand({ TableName: name, TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true } }));
  console.log(`✓ ${name} TTL enabled`);
}

async function main() {
  console.log(`region: ${env.region}`);
  await ensure(env.subscribersTable, [{ name: "phone", type: "HASH" }]);
  await ensure(env.historyTable, [
    { name: "pk", type: "HASH" },
    { name: "sk", type: "RANGE" },
  ]);
  await enableTtl(env.historyTable);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
