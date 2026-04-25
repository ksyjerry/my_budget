import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Disable dev indicator UI (positioned badge in corner).
  devIndicators: {
    position: "bottom-right",
  },
  productionBrowserSourceMaps: false,
};

if (process.env.NODE_ENV === "production") {
  // Belt-and-braces: assert no dev mode artifacts.
  nextConfig.compiler = {
    ...(nextConfig.compiler || {}),
    removeConsole: { exclude: ["error", "warn"] },
  };
}

export default nextConfig;
