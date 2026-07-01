import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const safariOutputDir = resolve(".output", "safari-mv2");

if (!existsSync(safariOutputDir)) {
  console.error("Safari build output not found. Run `pnpm wxt build -b safari` first.");
  process.exit(1);
}

const probe = spawnSync("xcrun", ["--help"], {
  stdio: "ignore",
  shell: process.platform === "win32"
});

if (probe.error || probe.status !== 0) {
  console.error(
    [
      "Safari packaging requires Apple's `xcrun` tool on macOS with Xcode installed.",
      `Build output is ready at: ${safariOutputDir}`,
      "Run this command on a Mac:",
      `xcrun safari-web-extension-packager "${safariOutputDir}" --no-open`
    ].join("\n")
  );
  process.exit(1);
}

const result = spawnSync(
  "xcrun",
  ["safari-web-extension-packager", safariOutputDir, "--no-open"],
  {
    stdio: "inherit",
    shell: process.platform === "win32"
  }
);

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
