import { resolve } from "node:path";
import { validateBuildArtifacts } from "../src/core/build/artifacts.ts";

const outputRoot = resolve(".output");

try {
  const checks = await validateBuildArtifacts(outputRoot);
  console.log(`Validated build artifacts in ${outputRoot}`);
  for (const check of checks) {
    console.log(`- ${check.target}: ${check.manifestPath}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
