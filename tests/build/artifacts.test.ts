import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateBuildArtifacts } from "../../src/core/build/artifacts";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    })
  );
});

async function createArtifactTree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "onesync-artifacts-"));
  tempDirectories.push(root);

  for (const directory of ["chrome-mv3", "firefox-mv2", "safari-mv2"]) {
    await mkdir(join(root, directory, "icons"), { recursive: true });
    const toolbarAction =
      directory === "chrome-mv3"
        ? {
            action: {
              default_icon: {
                16: "icons/icon-16.png",
                32: "icons/icon-32.png"
              }
            }
          }
        : {
            browser_action: {
              default_icon: {
                16: "icons/icon-16.png",
                32: "icons/icon-32.png"
              }
            }
          };
    await writeFile(
      join(root, directory, "manifest.json"),
      JSON.stringify(
        directory === "firefox-mv2"
          ? {
              icons: {
                16: "icons/icon-16.png",
                32: "icons/icon-32.png",
                48: "icons/icon-48.png",
                128: "icons/icon-128.png"
              },
              ...toolbarAction,
              browser_specific_settings: {
                gecko: {
                  id: "onesync@example.test",
                  data_collection_permissions: {
                    required: ["none"]
                  }
                }
              }
            }
          : {
              icons: {
                16: "icons/icon-16.png",
                32: "icons/icon-32.png",
                48: "icons/icon-48.png",
                128: "icons/icon-128.png"
              },
              ...toolbarAction
            }
      )
    );
    await writeFile(join(root, directory, "background.js"), "console.log('ok');");
    await writeFile(join(root, directory, "popup.html"), "<html></html>");
    await writeFile(join(root, directory, "options.html"), "<html></html>");
    await writeFile(join(root, directory, "icons", "icon.svg"), "<svg></svg>");
    await writeFile(join(root, directory, "icons", "icon-16.png"), "png");
    await writeFile(join(root, directory, "icons", "icon-32.png"), "png");
    await writeFile(join(root, directory, "icons", "icon-48.png"), "png");
    await writeFile(join(root, directory, "icons", "icon-128.png"), "png");
  }

  return root;
}

describe("validateBuildArtifacts", () => {
  it("accepts a complete chrome, firefox, and safari artifact set", async () => {
    const root = await createArtifactTree();

    await expect(validateBuildArtifacts(root)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "chrome-mv3" }),
        expect.objectContaining({ target: "firefox-mv2" }),
        expect.objectContaining({ target: "safari-mv2" })
      ])
    );
  });

  it("rejects firefox artifacts that miss the gecko id contract", async () => {
    const root = await createArtifactTree();
    await writeFile(
      join(root, "firefox-mv2", "manifest.json"),
      JSON.stringify({
        icons: {
          16: "icons/icon-16.png",
          32: "icons/icon-32.png",
          48: "icons/icon-48.png",
          128: "icons/icon-128.png"
        },
        browser_action: {
          default_icon: {
            16: "icons/icon-16.png",
            32: "icons/icon-32.png"
          }
        }
      })
    );

    await expect(validateBuildArtifacts(root)).rejects.toThrow(/gecko\.id/i);
  });

  it("rejects artifacts that miss the options page", async () => {
    const root = await createArtifactTree();
    await rm(join(root, "chrome-mv3", "options.html"));

    await expect(validateBuildArtifacts(root)).rejects.toThrow(/options\.html/i);
  });

  it("rejects artifacts that miss declared toolbar icons", async () => {
    const root = await createArtifactTree();
    await rm(join(root, "chrome-mv3", "icons", "icon-16.png"));

    await expect(validateBuildArtifacts(root)).rejects.toThrow(/icon-16\.png/i);
  });
});
