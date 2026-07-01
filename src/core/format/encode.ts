import {
  encodeBundleLocally,
  type EncodeBundleOptions,
  type EncodeBundleProgress
} from "./encode-core";
import type { BookmarkBundle, EncodedBookmarkBundle } from "./schema";

type EncodeWorkerMessage =
  | { type: "progress"; detail: EncodeBundleProgress["detail"] }
  | { type: "result"; encodedBundle: EncodedBookmarkBundle }
  | { type: "error"; message: string };

function canUseEncodingWorker(): boolean {
  return typeof document !== "undefined" && typeof Worker !== "undefined";
}

async function encodeBundleInWorker(
  bundle: BookmarkBundle,
  options: EncodeBundleOptions = {}
): Promise<EncodedBookmarkBundle> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./encode.worker.ts", import.meta.url), {
      type: "module"
    });

    worker.onmessage = (event: MessageEvent<EncodeWorkerMessage>) => {
      const message = event.data;

      if (message.type === "progress") {
        void options.onProgress?.({
          detail: message.detail
        });
        return;
      }

      worker.terminate();

      if (message.type === "result") {
        resolve(message.encodedBundle);
        return;
      }

      reject(new Error(message.message));
    };

    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Encoding worker failed"));
    };

    worker.postMessage({ bundle });
  });
}

export async function encodeBundle(
  bundle: BookmarkBundle,
  options: EncodeBundleOptions = {}
): Promise<EncodedBookmarkBundle> {
  if (canUseEncodingWorker()) {
    return encodeBundleInWorker(bundle, options);
  }

  return encodeBundleLocally(bundle, options);
}
