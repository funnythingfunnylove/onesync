import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

type BuildTarget = "chrome-mv3" | "firefox-mv2" | "safari-mv2";

export type BuildArtifactCheck = {
  target: BuildTarget;
  manifestPath: string;
  requiredFiles: string[];
};

const REQUIRED_TARGETS: BuildTarget[] = ["chrome-mv3", "firefox-mv2", "safari-mv2"];
const REQUIRED_RELATIVE_FILES = [
  "manifest.json",
  "background.js",
  "popup.html",
  "options.html",
  join("icons", "icon.svg"),
  join("icons", "icon-16.png"),
  join("icons", "icon-32.png"),
  join("icons", "icon-48.png"),
  join("icons", "icon-128.png")
] as const;

export async function validateBuildArtifacts(outputRoot: string): Promise<BuildArtifactCheck[]> {
  const checks: BuildArtifactCheck[] = [];

  for (const target of REQUIRED_TARGETS) {
    const targetRoot = join(outputRoot, target);

    for (const relativeFile of REQUIRED_RELATIVE_FILES) {
      try {
        await access(join(targetRoot, relativeFile));
      } catch {
        throw new Error(`${target} artifact is missing required file ${relativeFile}`);
      }
    }

    const manifestPath = join(targetRoot, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    const icons = manifest.icons as Record<string, unknown> | undefined;
    const toolbarAction =
      ((manifest.action as { default_icon?: Record<string, unknown> } | undefined) ??
        (manifest.browser_action as { default_icon?: Record<string, unknown> } | undefined)) ??
      undefined;

    if (
      icons?.["16"] !== "icons/icon-16.png" ||
      icons?.["32"] !== "icons/icon-32.png" ||
      icons?.["48"] !== "icons/icon-48.png" ||
      icons?.["128"] !== "icons/icon-128.png"
    ) {
      throw new Error(`${target} artifact manifest is missing the declared extension PNG icons`);
    }

    if (
      toolbarAction?.default_icon?.["16"] !== "icons/icon-16.png" ||
      toolbarAction?.default_icon?.["32"] !== "icons/icon-32.png"
    ) {
      throw new Error(`${target} artifact manifest is missing the declared toolbar PNG icons`);
    }

    if (target === "firefox-mv2") {
      const geckoSettings = (manifest.browser_specific_settings as { gecko?: Record<string, unknown> } | undefined)
        ?.gecko;

      if (!geckoSettings?.id) {
        throw new Error("Firefox artifact manifest is missing browser_specific_settings.gecko.id");
      }

      const requiredDataCollection =
        (geckoSettings.data_collection_permissions as { required?: unknown } | undefined)?.required;

      if (!Array.isArray(requiredDataCollection) || requiredDataCollection[0] !== "none") {
        throw new Error(
          "Firefox artifact manifest is missing browser_specific_settings.gecko.data_collection_permissions.required=['none']"
        );
      }
    }

    checks.push({
      target,
      manifestPath,
      requiredFiles: REQUIRED_RELATIVE_FILES.map((relativeFile) => join(targetRoot, relativeFile))
    });
  }

  return checks;
}
