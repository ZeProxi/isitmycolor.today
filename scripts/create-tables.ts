/**
 * One-time setup: creates the two DynamoDB tables (on-demand billing).
 *   npx tsx scripts/create-tables.ts
 */
import "dotenv/config";
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
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

async function main() {
  console.log(`region: ${env.region}`);
  await ensure(env.subscribersTable, [{ name: "phone", type: "HASH" }]);
  await ensure(env.historyTable, [
    { name: "pk", type: "HASH" },
    { name: "sk", type: "RANGE" },
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
