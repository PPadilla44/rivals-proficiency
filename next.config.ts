import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The preview-only screenshot accuracy check reads these at runtime.
  outputFileTracingIncludes: {
    "/api/dev/scan-eval": ["tests/fixtures/heroes-tab/**/*"],
  },
};

export default nextConfig;
