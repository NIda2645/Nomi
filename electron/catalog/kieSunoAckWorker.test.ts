import { describe, expect, it } from "vitest";
import * as entry from "../../worker";
import worker, { type WorkerEnv } from "../../worker";
import { ACK_PATH } from "../../worker/kieSunoAck";

// The callback sink must answer on its own; touching static assets would be a bug.
const env: WorkerEnv = { ASSETS: { fetch: () => Promise.reject(new Error("ACK path must not reach ASSETS")) } };

describe("KIE Suno callback ACK worker", () => {
  it("acknowledges POST without consuming or forwarding the body", async () => {
    let consumed = false;
    const request = new Request(`https://nomiaqm.com${ACK_PATH}`, {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("secret-looking callback"));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    Object.defineProperty(request, "text", { value: () => { consumed = true; return Promise.resolve(""); } });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "received" });
    expect(consumed).toBe(false);
  });

  it("rejects non-POST methods", async () => {
    const response = await worker.fetch(new Request(`https://nomiaqm.com${ACK_PATH}`), env);
    expect(response.status).toBe(405);
  });

  it("keeps the worker entry module to its default handler", () => {
    // workerd treats every named export of the entry module as an entrypoint and refuses
    // to start the worker when one is a plain value (e.g. an exported path string).
    expect(Object.keys(entry)).toEqual(["default"]);
  });
});
