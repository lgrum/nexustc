import type { NextConfig } from "next";

const assetsBucketUrl = process.env.NEXT_PUBLIC_ASSETS_BUCKET_URL;
if (!assetsBucketUrl) {
  throw new Error("NEXT_PUBLIC_ASSETS_BUCKET_URL is required");
}

const assetHost = new URL(assetsBucketUrl);

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        hostname: assetHost.hostname,
        protocol: assetHost.protocol.replace(":", "") as "http" | "https",
      },
    ],
  },
};

export default nextConfig;
