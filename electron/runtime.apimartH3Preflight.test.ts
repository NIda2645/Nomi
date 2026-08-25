import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedUserDataRoot = "";
const tempRoots: string[] = [];

vi.mock("electron", () => ({
  app: {
    getPath: () => mockedUserDataRoot,
    getAppPath: () => process.cwd(),
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}));

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

beforeEach(() => {
  mockedUserDataRoot = makeTempDir("nomi-runtime-apimart-h3-preflight-");
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

async function seedApimartH3(): Promise<void> {
  const store = await import("./catalog/catalogStore");
  store.ensureBuiltinModelSeeds();
  store.upsertModelCatalogVendorApiKey("apimart", { apiKey: "sk-test" });
}

describe("runTask MiniMax H3 preflight", () => {
  it("rejects mixed frame/reference input before local asset upload, vendor fetch, or spend", async () => {
    await seedApimartH3();
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchFn);

    const { runTask } = await import("./runtime");
    const { __spendGrantCountForTests, mintSpendGrant } = await import("./spendGrant");
    const grantId = mintSpendGrant({ nodeIds: ["h3-node"], maxAttemptsPerNode: 1 });

    const error = await runTask({
      vendor: "apimart",
      request: {
        kind: "image_to_video",
        prompt: "把办公室里的画面动起来",
        extras: {
          modelKey: "MiniMax-H3",
          nodeId: "h3-node",
          grantId,
          firstFrameUrl: "nomi-local://first-frame",
          referenceImages: ["nomi-local://reference-image"],
          // Renderer-produced mode projection can carry both keys in a stale/invalid node;
          // the preflight must validate the rendered wire body, not only flat headless inputs.
          archetypeInput: {
            first_frame_image: "nomi-local://first-frame",
            image_urls: ["nomi-local://reference-image"],
          },
        },
      },
    }).catch((value) => value as Error);

    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).toMatch(/首尾帧.*参考素材/);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(__spendGrantCountForTests()).toBe(1);
  }, 15_000);
});
