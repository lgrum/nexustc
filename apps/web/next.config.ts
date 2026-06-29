import { config } from "dotenv";
import type { NextConfig } from "next";

config({ path: "../../.env" });
process.env.NEXT_PUBLIC_ASSETS_BUCKET_URL ??=
  process.env.VITE_ASSETS_BUCKET_URL;
process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??=
  process.env.VITE_TURNSTILE_SITE_KEY;
process.env.SHRINKME_TOKEN ??= "missing-shrinkme-token";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        hostname: "**",
        protocol: "https",
      },
    ],
  },
};

export default nextConfig;
