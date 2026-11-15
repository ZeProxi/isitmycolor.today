/**
 * While the AWS account is in the SNS SMS sandbox, texts only go to verified numbers.
 *   npx tsx scripts/sns-sandbox.ts status
 *   npx tsx scripts/sns-sandbox.ts add +18015551234        # AWS texts a one-time code
 *   npx tsx scripts/sns-sandbox.ts verify +18015551234 123456
 *   npx tsx scripts/sns-sandbox.ts list
 * To text anyone, request production access in the SNS console (Text messaging > Sandbox > Exit).
 */
import "dotenv/config";
import {
  SNSClient,
  GetSMSSandboxAccountStatusCommand,
  CreateSMSSandboxPhoneNumberCommand,
  VerifySMSSandboxPhoneNumberCommand,
  ListSMSSandboxPhoneNumbersCommand,
} from "@aws-sdk/client-sns";
import { env, awsCredentials } from "../src/lib/env";
import { normalizePhone } from "../src/lib/sms";

const sns = new SNSClient({ region: env.region, credentials: awsCredentials() });
const [cmd, rawPhone, code] = process.argv.slice(2);

async function main() {
  console.log(`region: ${env.region}`);
  if (cmd === "status") {
    const r = await sns.send(new GetSMSSandboxAccountStatusCommand({}));
    console.log(r.IsInSandbox ? "Account is IN the SMS sandbox" : "Account has production SMS access");
  } else if (cmd === "add") {
    const phone = normalizePhone(rawPhone ?? "");
    if (!phone) throw new Error("usage: add <phone>");
    await sns.send(new CreateSMSSandboxPhoneNumberCommand({ PhoneNumber: phone, LanguageCode: "en-US" }));
    console.log(`Verification code sent to ${phone}. Then run: verify ${phone} <code>`);
  } else if (cmd === "verify") {
    const phone = normalizePhone(rawPhone ?? "");
    if (!phone || !code) throw new Error("usage: verify <phone> <code>");
    await sns.send(new VerifySMSSandboxPhoneNumberCommand({ PhoneNumber: phone, OneTimePassword: code }));
    console.log(`${phone} verified`);
  } else if (cmd === "list") {
    const r = await sns.send(new ListSMSSandboxPhoneNumbersCommand({}));
    for (const p of r.PhoneNumbers ?? []) console.log(`${p.PhoneNumber}  ${p.Status}`);
    if (!r.PhoneNumbers?.length) console.log("(no sandbox numbers)");
  } else {
    console.log("commands: status | add <phone> | verify <phone> <code> | list");
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
