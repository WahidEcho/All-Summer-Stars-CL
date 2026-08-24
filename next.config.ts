import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // The commit each build was made from, stamped into the client bundle so a
    // wall can say which version it is running. Debugging the LED display
    // otherwise involves guessing whether a refresh actually picked up a
    // deploy — it demonstrably doesn't always.
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
  },
};

export default nextConfig;
