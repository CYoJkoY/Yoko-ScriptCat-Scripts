import { quotaState } from "./state";
import { noteAccountPrefix } from "./account";
import { parseBatchExecuteResponse } from "./batch";
import { commitOfficialQuota } from "./cache";
import { USAGE_RPC_ID } from "./constants";
import {
  noteDiag,
  noteNetwork,
  obsDiag,
  rememberBatchResponse,
  rememberQuotaSnippets,
  rememberRawFrame,
} from "./diagnostics";
import { origFetch, origXhrOpen, origXhrSend } from "./orig";
import { extractQuotaFromWizStructure } from "./quota";
import { parseUsageRpcPayload } from "./rpc";
import { triggerOfficialSync } from "./runtime";

let responseCompleteTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSyncAfterResponse(): void {
  if (responseCompleteTimer) clearTimeout(responseCompleteTimer);
  responseCompleteTimer = setTimeout(() => {
    responseCompleteTimer = null;
    void triggerOfficialSync(false);
  }, 1800);
}

function inspectNetworkTraffic(
  url: string,
  reqBody: string,
  responseText: string,
): void {
  if (!url) return;

  // Chat responses are sampled too: quota metadata may ride along in
  // StreamGenerateContent payloads.
  if (
    url.includes("StreamGenerateContent") ||
    url.includes("assistant.vertical.chat")
  ) {
    rememberQuotaSnippets("chat", null, url, responseText);
    scheduleSyncAfterResponse();
    return;
  }

  if (!url.includes("/batchexecute") || !responseText) return;

  obsDiag.batchExecSeen += 1;
  const frames = parseBatchExecuteResponse(responseText);
  rememberBatchResponse(url, responseText, frames);
  if (frames.length === 0) obsDiag.responseReadFailures += 1;
  for (const frame of frames) {
    noteDiag(frame.rpcId);
    rememberRawFrame(url, frame.rpcId, frame.payload);
    try {
      rememberQuotaSnippets(
        "rpc",
        frame.rpcId,
        url,
        JSON.stringify(frame.payload),
      );
    } catch {
      // Unserializable payloads are skipped.
    }
    const extracted =
      frame.rpcId === USAGE_RPC_ID
        ? parseUsageRpcPayload(frame.payload)
        : extractQuotaFromWizStructure(frame.payload, Date.now(), {
            useLabels: false,
          });
    if (!extracted) {
      obsDiag.nonQuotaResponses += 1;
      continue;
    }
    obsDiag.quotaHits += 1;
    if (reqBody) {
      quotaState.capturedQuotaRpc = {
        url,
        body: reqBody,
        rpcId: frame.rpcId,
      };
    }
    commitOfficialQuota(extracted, "rpc", true);
  }
}

function readFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof input === "object" && input !== null) {
    const value: unknown = Reflect.get(input, "url");
    if (typeof value === "string") return value;
  }
  return "";
}

export function installNetworkObserver(): void {
  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = readFetchUrl(input);
    noteAccountPrefix(url);
    const body: unknown = init ? init.body : null;
    const reqBody = typeof body === "string" ? body : "";

    const response = await origFetch.call(this, input, init);

    try {
      noteNetwork(url, response.status, 0);
      if (
        url.includes("/batchexecute") ||
        url.includes("StreamGenerateContent") ||
        url.includes("assistant.vertical.chat")
      ) {
        const cloned = response.clone();
        cloned
          .text()
          .then((text: string) => inspectNetworkTraffic(url, reqBody, text))
          .catch(() => {
            // Cloned body may be unreadable; the original response is intact.
          });
      }
    } catch {
      // Observing a response must never change what the page receives.
    }

    return response;
  };

  const requestUrls = new WeakMap<XMLHttpRequest, string>();

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    const targetUrl = typeof url === "string" ? url : String(url);
    requestUrls.set(this, targetUrl);
    noteAccountPrefix(targetUrl);
    Reflect.apply(origXhrOpen, this, [method, url, async, username, password]);
  };

  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const url = requestUrls.get(this) ?? "";
    if (
      url.includes("/batchexecute") ||
      url.includes("StreamGenerateContent") ||
      url.includes("assistant.vertical.chat")
    ) {
      const reqBody = typeof body === "string" ? body : "";
      this.addEventListener("load", () => {
        try {
          const responseText = this.responseText;
          noteNetwork(
            url,
            this.status,
            typeof responseText === "string" ? responseText.length : 0,
          );
          if (typeof responseText === "string" && responseText.length > 0) {
            inspectNetworkTraffic(url, reqBody, responseText);
          }
        } catch {
          // responseText may throw for non-text responseType values.
        }
      });
    }
    Reflect.apply(origXhrSend, this, [body]);
  };
}
