import { writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import {
  DeleteObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  HeadObjectCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { LifecycleRule } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@repo/env";

import {
  PROFILE_MEDIA_PERMANENT_PREFIX,
  PROFILE_MEDIA_TEMPORARY_PREFIX,
} from "../src/services/profile-media";
import { createR2Client } from "../src/utils/s3";

const RULE_ID = "profile-media-abandoned-sources-1d";
const TEMPORARY_PREFIX = `${PROFILE_MEDIA_TEMPORARY_PREFIX}/`;
const PERMANENT_PREFIX = `${PROFILE_MEDIA_PERMANENT_PREFIX}/`;
const EXPIRATION_DAYS = 1;

function getArgument(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function getRequiredArgument(name: string) {
  const value = getArgument(name);
  if (!value) {
    throw new Error(`Missing --${name}=...`);
  }
  return value;
}

function getRequiredValue(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

type LockRule = {
  condition: unknown;
  enabled: boolean;
  id: string;
  prefix?: string;
};

function isLockRule(value: unknown): value is LockRule {
  return (
    typeof value === "object" &&
    value !== null &&
    "condition" in value &&
    "enabled" in value &&
    typeof value.enabled === "boolean" &&
    "id" in value &&
    typeof value.id === "string" &&
    (!("prefix" in value) || typeof value.prefix === "string")
  );
}

async function getLockRules(
  accountId: string,
  bucket: string,
  apiToken: string
): Promise<LockRule[]> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/lock`,
    { headers: { Authorization: `Bearer ${apiToken}` } }
  );
  const payload: unknown = await response.json();
  if (
    !response.ok ||
    typeof payload !== "object" ||
    payload === null ||
    !("result" in payload) ||
    typeof payload.result !== "object" ||
    payload.result === null ||
    !("rules" in payload.result) ||
    !Array.isArray(payload.result.rules)
  ) {
    throw new Error(`Could not inventory R2 lock rules (${response.status})`);
  }
  if (!payload.result.rules.every(isLockRule)) {
    throw new Error("Cloudflare returned invalid R2 lock rules");
  }
  return payload.result.rules;
}

function lockOverlapsProfileMedia(rule: LockRule) {
  if (!rule.enabled) {
    return false;
  }
  const prefix = rule.prefix ?? "";
  return [TEMPORARY_PREFIX, PERMANENT_PREFIX].some(
    (profilePrefix) =>
      profilePrefix.startsWith(prefix) || prefix.startsWith(profilePrefix)
  );
}

function desiredRule(): LifecycleRule {
  return {
    Expiration: { Days: EXPIRATION_DAYS },
    Filter: { Prefix: TEMPORARY_PREFIX },
    ID: RULE_ID,
    Status: "Enabled",
  };
}

function ruleIsDesired(rule: LifecycleRule | undefined) {
  return (
    rule?.Status === "Enabled" &&
    rule.Filter?.Prefix === TEMPORARY_PREFIX &&
    rule.Expiration?.Days === EXPIRATION_DAYS
  );
}

async function getLifecycleRules(
  client: ReturnType<typeof createR2Client>,
  bucket: string
) {
  try {
    const configuration = await client.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: bucket })
    );
    return configuration.Rules ?? [];
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "NoSuchLifecycleConfiguration" ||
        error.name === "NoSuchLifecycle")
    ) {
      return [];
    }
    throw error;
  }
}

async function uploadProbe(
  client: ReturnType<typeof createR2Client>,
  bucket: string,
  objectKey: string
) {
  const body = "profile-media-lifecycle-verification";
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Body: body,
      Bucket: bucket,
      ContentLength: Buffer.byteLength(body),
      ContentType: "text/plain",
      Key: objectKey,
    }),
    { expiresIn: 300 }
  );
  const response = await fetch(url, {
    body,
    headers: { "Content-Type": "text/plain" },
    method: "PUT",
  });
  if (!response.ok) {
    throw new Error(`Presigned probe upload failed (${response.status})`);
  }
}

async function main() {
  const bucket = getRequiredArgument("bucket");
  const confirmedBucket = getRequiredArgument("confirm-bucket");
  const confirmedPrefix = getRequiredArgument("confirm-prefix");
  const configuredBucket = env.R2_ASSETS_BUCKET_NAME;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = getRequiredValue(
    "CLOUDFLARE_API_TOKEN",
    env.CLOUDFLARE_API_TOKEN
  );
  const apply = process.argv.includes("--apply");

  if (
    bucket !== configuredBucket ||
    confirmedBucket !== bucket ||
    confirmedPrefix !== TEMPORARY_PREFIX
  ) {
    throw new Error(
      "Bucket or prefix confirmation does not match the configured target"
    );
  }
  if (PERMANENT_PREFIX.startsWith(TEMPORARY_PREFIX)) {
    throw new Error("Permanent Profile Media overlaps the temporary prefix");
  }

  const client = createR2Client({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    accountId,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
  const [lifecycleRules, lockRules] = await Promise.all([
    getLifecycleRules(client, bucket),
    getLockRules(accountId, bucket, apiToken),
  ]);

  console.log(
    JSON.stringify(
      {
        bucket,
        lifecycleRules,
        lockRules,
        plannedRule: desiredRule(),
      },
      null,
      2
    )
  );

  const overlappingLocks = lockRules.filter(lockOverlapsProfileMedia);
  if (overlappingLocks.length > 0) {
    throw new Error(
      `Bucket lock rules overlap Profile Media verification keys: ${overlappingLocks
        .map((rule) => rule.id)
        .join(", ")}`
    );
  }
  if (!apply) {
    console.log("Inventory complete; no bucket mutation attempted.");
    return;
  }

  const handoffPath = getRequiredArgument("handoff");
  const existingRule = lifecycleRules.find((rule) => rule.ID === RULE_ID);
  const preservedRules = lifecycleRules.filter((rule) => rule.ID !== RULE_ID);
  if (!ruleIsDesired(existingRule)) {
    await client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: {
          Rules: [...preservedRules, desiredRule()],
        },
      })
    );
  }

  const appliedRules = await getLifecycleRules(client, bucket);
  if (!ruleIsDesired(appliedRules.find((rule) => rule.ID === RULE_ID))) {
    throw new Error("R2 did not return the expected lifecycle rule");
  }
  if (
    preservedRules.some(
      (rule) =>
        !appliedRules.some((appliedRule) =>
          isDeepStrictEqual(appliedRule, rule)
        )
    )
  ) {
    throw new Error("R2 did not preserve every existing lifecycle rule");
  }

  const probeId = crypto.randomUUID();
  const temporaryKey = `${TEMPORARY_PREFIX}verification/${probeId}.txt`;
  const permanentKey = `${PERMANENT_PREFIX}verification/${probeId}.txt`;
  let temporaryExpiration: string | undefined;
  try {
    await uploadProbe(client, bucket, temporaryKey);
    await uploadProbe(client, bucket, permanentKey);
    const [temporary, permanent] = await Promise.all([
      client.send(new HeadObjectCommand({ Bucket: bucket, Key: temporaryKey })),
      client.send(new HeadObjectCommand({ Bucket: bucket, Key: permanentKey })),
    ]);
    temporaryExpiration = temporary.Expiration;
    if (!temporaryExpiration?.includes(`rule-id="${RULE_ID}"`)) {
      throw new Error(
        "Temporary probe did not report the expected expiration rule"
      );
    }
    if (permanent.Expiration) {
      throw new Error(
        `Permanent probe unexpectedly reports expiration: ${permanent.Expiration}`
      );
    }
  } finally {
    await Promise.all([
      client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: temporaryKey })
      ),
      client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: permanentKey })
      ),
    ]);
  }

  const handoff = [
    "# Profile Media R2 lifecycle deployment",
    "",
    `- Verified at: ${new Date().toISOString()}`,
    `- Bucket: \`${bucket}\``,
    `- Rule: \`${RULE_ID}\``,
    `- Prefix: \`${TEMPORARY_PREFIX}\``,
    `- Expiration: ${EXPIRATION_DAYS} day`,
    `- Preserved lifecycle rules: ${preservedRules.length}`,
    `- Preserved lock rules: ${lockRules.length}`,
    `- Temporary probe expiration metadata: \`${temporaryExpiration}\``,
    "- Permanent probe expiration metadata: absent",
    "- Verification objects removed: yes",
    "",
  ].join("\n");
  await writeFile(handoffPath, handoff, { flag: "wx" });
  console.log(`Verification passed; handoff written to ${handoffPath}`);
}

await main();
