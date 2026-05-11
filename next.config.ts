import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// Only run Cloudflare dev bindings in local development, never on Vercel
if (process.env.NODE_ENV === "development") {
  import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
}

export default nextConfig;
