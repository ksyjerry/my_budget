import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: process.env.FRONTEND_URL || "http://localhost:8001",
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "default",
      testIgnore: ["**/regression/**", "**/smoke/**", "**/__visual__/**"],
      use: { browserName: "chromium" },
    },
    {
      name: "regression",
      testDir: "./tests/regression",
      use: { browserName: "chromium" },
    },
    {
      name: "smoke",
      testDir: "./tests/smoke",
      use: { browserName: "chromium" },
    },
    {
      name: "visual",
      testMatch: /__visual__\/.*\.spec\.ts$/,
      use: { browserName: "chromium" },
      expect: { toHaveScreenshot: { maxDiffPixels: 100 } },
    },
  ],
});
