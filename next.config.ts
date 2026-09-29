import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Screenshots upload as up to four full-resolution tiles.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // The preview-only screenshot accuracy check reads these at runtime.
  outputFileTracingIncludes: {
    "/api/dev/scan-eval": ["tests/fixtures/heroes-tab/**/*"],
  },
};

export default nextConfig;
