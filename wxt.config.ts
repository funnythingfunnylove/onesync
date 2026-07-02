import { defineConfig } from "wxt";

export default defineConfig({
  manifest: ({ browser }) => ({
    name: "onesync",
    description: "Bookmark sync over WebDAV with one shared format.",
    version: "0.2.0",
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png"
    },
    permissions: ["bookmarks", "storage", "alarms"],
    host_permissions: ["https://*/*", "http://*/*"],
    ...(browser === "chrome"
      ? {
          action: {
            default_title: "onesync",
            default_popup: "popup.html",
            default_icon: {
              16: "icons/icon-16.png",
              32: "icons/icon-32.png"
            }
          }
        }
      : {
          browser_action: {
            default_title: "onesync",
            default_popup: "popup.html",
            default_icon: {
              16: "icons/icon-16.png",
              32: "icons/icon-32.png"
            }
          }
        }),
    options_ui: {
      open_in_tab: true,
      page: "options.html"
    },
    browser_specific_settings:
      browser === "firefox"
        ? {
            gecko: {
              id: "onesync@example.test",
              data_collection_permissions: {
                required: ["none"]
              },
              strict_min_version: "128.0"
            }
          }
        : undefined
  })
});
