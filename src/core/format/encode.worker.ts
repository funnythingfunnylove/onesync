import { encodeBundleLocally } from "./encode-core";
import type { BookmarkBundle } from "./schema";

type EncodeWorkerRequest = {
  bundle: BookmarkBundle;
};

type EncodeWorkerResponse =
  | { type: "progress"; detail: string }
  | { type: "result"; encodedBundle: Awaited<ReturnType<typeof encodeBundleLocally>> }
  | { type: "error"; message: string };

self.onmessage = async (event: MessageEvent<EncodeWorkerRequest>) => {
  try {
    const encodedBundle = await encodeBundleLocally(event.data.bundle, {
      onProgress(progress) {
        const response: EncodeWorkerResponse = {
          type: "progress",
          detail: progress.detail
        };
        self.postMessage(response);
      }
    });

    const response: EncodeWorkerResponse = {
      type: "result",
      encodedBundle
    };
    self.postMessage(response);
  } catch (error) {
    const response: EncodeWorkerResponse = {
      type: "error",
      message: error instanceof Error ? error.message : String(error)
    };
    self.postMessage(response);
  }
};
