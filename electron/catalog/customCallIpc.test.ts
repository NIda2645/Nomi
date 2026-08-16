import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => process.cwd(), getAppPath: () => process.cwd() },
  ipcMain: { handle: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}));

import {
  CUSTOM_CALL_RETURN_CONTRACT,
  CUSTOM_CALL_TEMPLATES,
  CUSTOM_CALL_VARIABLES,
} from "./customCallContract";
import { registerCustomCallIpc } from "./customCallIpc";

describe("custom-call contract IPC", () => {
  it("exposes the same variables, return contract, and templates used by the runner and AI prompt", () => {
    const syncHandlers = new Map<string, (...args: never[]) => unknown>();
    registerCustomCallIpc((channel, handler) => syncHandlers.set(channel, handler));

    const handler = syncHandlers.get("nomi:model-catalog:custom-call:contract");
    expect(handler).toBeTypeOf("function");
    expect(handler?.()).toEqual({
      variables: CUSTOM_CALL_VARIABLES.map(({ name, type }) => ({ name, type })),
      returnContract: CUSTOM_CALL_RETURN_CONTRACT,
      templates: CUSTOM_CALL_TEMPLATES,
    });
  });
});
