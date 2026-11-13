import { assert, isRecord } from "../core/protocol";
import { validateSnapshot, type SceneSnapshot } from "./validation";

// An opaque-origin document gives its blob worker an inherited deny-network CSP.
// This works on GitHub Pages, where custom HTTP response headers are unavailable.
const BOOTSTRAP = `<!doctype html><meta http-equiv="Content-Security-Policy"
content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'none'; worker-src blob:; img-src 'none';">
<script>
addEventListener('message', event => {
  if (event.source !== parent || event.data?.type !== 'astra:boot') return;
  const port = event.ports[0];
  const url = URL.createObjectURL(new Blob([event.data.runtime], {type:'text/javascript'}));
  const worker = new Worker(url);
  worker.onmessage = event => port.postMessage(event.data);
  worker.onerror = event => port.postMessage({type:'error',message:event.message || 'Worker failed'});
  port.onmessage = () => { worker.terminate(); URL.revokeObjectURL(url); };
  worker.postMessage({source:event.data.source,parameters:event.data.parameters});
}, {once:true});
</script>`;

let runtimePromise: Promise<string> | undefined;

export function getGeneratorRuntime(): Promise<string> {
  runtimePromise ??= fetch(`${import.meta.env.BASE_URL}runtime/generator.js`, {
    signal: AbortSignal.timeout(15_000),
  })
    .then((response) => {
      if (!response.ok) throw new Error("无法获取生成运行时");
      return response.text();
    })
    .catch((error) => {
      runtimePromise = undefined;
      throw error;
    });
  return runtimePromise;
}

export async function generate(
  source: string,
  parameters: { radius: number; seed: number; detail: "far" | "near" },
  signal?: AbortSignal,
  timeoutMs = 15_000,
): Promise<SceneSnapshot> {
  const runtime = await getGeneratorRuntime();
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.hidden = true;
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("aria-hidden", "true");
    const channel = new MessageChannel();
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      channel.port1.postMessage({ type: "stop" });
      channel.port1.close();
      iframe.remove();
    };
    const finish = (error?: unknown, snapshot?: SceneSnapshot) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(snapshot!);
    };
    const abort = () => finish(signal?.reason ?? new DOMException("已取消", "AbortError"));
    const timer = setTimeout(() => finish(new Error("星球生成超时")), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      try {
        assert(isRecord(event.data), "生成消息无效");
        if (event.data.type === "error") throw new Error(String(event.data.message).slice(0, 300));
        assert(event.data.type === "result", "未知生成消息");
        finish(undefined, validateSnapshot(event.data.snapshot));
      } catch (error) {
        finish(error);
      }
    };
    iframe.onload = () =>
      iframe.contentWindow?.postMessage(
        {
          type: "astra:boot",
          runtime,
          source,
          parameters,
        },
        "*",
        [channel.port2],
      );
    iframe.srcdoc = BOOTSTRAP;
    document.body.append(iframe);
  });
}
