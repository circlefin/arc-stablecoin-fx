import {
  initiateDeveloperControlledWalletsClient,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env.local");
const RECOVERY_PATH = resolve(process.cwd(), "circle-recovery.dat");
const KEY = "APP_FEE_RECIPIENT";
const SET_NAME = "arc-fx-platform";
const DEFAULT_BLOCKCHAIN = "ARC-TESTNET";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const step = (m: string) => console.log(`${c.cyan}›${c.reset} ${m}`);
const ok = (m: string) => console.log(`${c.green}✓${c.reset} ${m}`);
const warn = (m: string) => console.log(`${c.yellow}!${c.reset} ${m}`);
function fail(m: string): never {
  console.error(`${c.red}✗${c.reset} ${m}`);
  process.exit(1);
}

function parseEnv(source: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out.set(key, value);
  }
  return out;
}

function upsertEnvLine(source: string, key: string, value: string): string {
  const lines = source.split(/\r?\n/);
  const pattern = new RegExp(`^\\s*${key}\\s*=`);
  let replaced = false;
  const next = lines.map((line) => {
    if (!replaced && pattern.test(line)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!replaced) next.push(`${key}=${value}`);
  return next.join("\n");
}

function isInvalidEntitySecret(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /entity\s*secret/i.test(message);
}

async function registerSecret(apiKey: string, entitySecret: string) {
  step(`Entity secret not registered yet - registering with Circle…`);
  const response = await registerEntitySecretCiphertext({ apiKey, entitySecret });
  const recovery = response.data?.recoveryFile;
  if (!recovery) fail("Circle did not return a recovery file. Aborting.");
  await writeFile(RECOVERY_PATH, recovery, "utf8");
  ok(`Recovery file saved to ${c.bold}${RECOVERY_PATH}${c.reset}`);
  warn(`Keep this file safe - it is required to recover wallets if the entity secret is lost.`);
}

async function main() {
  console.log(`${c.bold}Arc FX · provision platform operator wallet${c.reset}`);
  console.log(`${c.dim}${ENV_PATH}${c.reset}\n`);

  let envSource: string;
  try {
    envSource = await readFile(ENV_PATH, "utf8");
  } catch {
    fail(`Could not read ${ENV_PATH}. Copy .env.example to .env.local first.`);
  }

  const env = parseEnv(envSource);
  const apiKey = env.get("CIRCLE_API_KEY");
  const entitySecret = env.get("CIRCLE_ENTITY_SECRET");
  const blockchain = env.get("CIRCLE_BLOCKCHAIN") || DEFAULT_BLOCKCHAIN;

  if (!apiKey) fail("CIRCLE_API_KEY is missing from .env.local");
  if (!entitySecret) fail("CIRCLE_ENTITY_SECRET is missing from .env.local");
  if (!/^[0-9a-f]{64}$/.test(entitySecret)) {
    fail("CIRCLE_ENTITY_SECRET must be 64 lowercase hex chars (32 bytes).");
  }

  const existing = env.get(KEY);
  if (existing && /^0x[0-9a-fA-F]{40}$/.test(existing)) {
    fail(
      `${KEY} is already set to ${existing}.\n` +
      `  Refusing to overwrite - fees may already be flowing to that address.\n` +
      `  Clear the value in .env.local first if you really want a new wallet.`,
    );
  }

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  async function provision(): Promise<{ address: string; walletId: string; walletSetId: string }> {
    step(`Creating platform wallet set "${SET_NAME}"…`);
    const setResponse = await client.createWalletSet({ name: SET_NAME });
    const walletSetId = setResponse.data?.walletSet?.id;
    if (!walletSetId) fail("Circle returned a response without a wallet set id.");

    step(`Creating EOA wallet on ${blockchain}…`);
    const walletResponse = await client.createWallets({
      walletSetId,
      blockchains: [blockchain as Parameters<typeof client.createWallets>[0]["blockchains"][number]],
      count: 1,
      accountType: "EOA",
    });
    const wallet = walletResponse.data?.wallets?.[0];
    if (!wallet) fail("Circle returned no wallet on createWallets()");
    return { address: wallet.address, walletId: wallet.id, walletSetId };
  }

  let result;
  try {
    result = await provision();
  } catch (err) {
    if (!isInvalidEntitySecret(err)) {
      const message = err instanceof Error ? err.message : String(err);
      fail(`Circle API call failed: ${message}`);
    }
    try {
      await registerSecret(apiKey, entitySecret);
    } catch (regErr) {
      const message = regErr instanceof Error ? regErr.message : String(regErr);
      if (/already been set/i.test(message)) {
        fail(
          "This API key already has a different entity secret registered with Circle.\n" +
          "  Either paste the original entity secret into CIRCLE_ENTITY_SECRET, or rotate\n" +
          "  the secret from the Circle Console and re-run this script.",
        );
      }
      fail(`Failed to register entity secret: ${message}`);
    }
    step(`Retrying provisioning…`);
    try {
      result = await provision();
    } catch (retryErr) {
      const message = retryErr instanceof Error ? retryErr.message : String(retryErr);
      fail(`Circle API call failed after registration: ${message}`);
    }
  }

  ok(`Wallet set:  ${c.dim}${result.walletSetId}${c.reset}`);
  ok(`Wallet id:   ${c.dim}${result.walletId}${c.reset}`);
  ok(`Address:     ${c.bold}${result.address}${c.reset}`);

  step(`Writing ${KEY} to .env.local…`);
  const updated = upsertEnvLine(envSource, KEY, result.address);
  await writeFile(ENV_PATH, updated.endsWith("\n") ? updated : `${updated}\n`, "utf8");
  ok(`.env.local updated.`);

  console.log(
    `\n${c.green}Done.${c.reset} App fees will accrue to this wallet. Restart \`npm run dev\` to pick up the change.`,
  );
}

await main();
