import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

test("smoke — docker-compose.yml frontend command is build+start", () => {
  const compose = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "docker-compose.yml"),
    "utf-8",
  );
  // Extract the frontend service block by finding "frontend:" and capturing until next top-level key
  const lines = compose.split("\n");
  let inFrontend = false;
  let frontendBlock = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*frontend:\s*$/.test(line)) {
      inFrontend = true;
      continue;
    }
    if (inFrontend) {
      if (/^\s*[a-z_]+:\s*$/.test(line) && !/^\s+/.test(line)) {
        break; // Hit another top-level key
      }
      frontendBlock += line + "\n";
    }
  }

  expect(frontendBlock).toContain("build");
  expect(frontendBlock).toContain("start");
  expect(frontendBlock).not.toContain("npm run dev");
});
