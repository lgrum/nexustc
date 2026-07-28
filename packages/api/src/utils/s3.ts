import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@repo/env";

let s3Client: S3Client | null = null;

export function createR2Client(input: {
  accessKeyId: string;
  accountId: string;
  secretAccessKey: string;
}) {
  return new S3Client({
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    },
    endpoint: `https://${input.accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
}

export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = createR2Client({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    });
  }
  return s3Client;
}
