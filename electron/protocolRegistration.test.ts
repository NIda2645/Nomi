import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => process.cwd() } }));

import { registerNomiProtocolClient } from "./protocolRegistration";

const fakeApp = (isPackaged: boolean) => ({ isPackaged, setAsDefaultProtocolClient: vi.fn(() => true) });

describe("nomi:// 协议登记只归正式安装", () => {
  it("未打包（开发版）不登记", () => {
    const app = fakeApp(false);
    expect(registerNomiProtocolClient(app, () => null)).toBe(false);
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  it("打包但是隔离实例（走查 / 评测）不登记", () => {
    const app = fakeApp(true);
    expect(registerNomiProtocolClient(app, () => "NOMI_E2E=1")).toBe(false);
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  it("真实的隔离判据：NOMI_E2E=1 的打包实例不登记", () => {
    vi.stubEnv("NOMI_E2E", "1");
    const app = fakeApp(true);
    expect(registerNomiProtocolClient(app)).toBe(false);
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("正式安装照常登记", () => {
    vi.stubEnv("NOMI_E2E", "");
    vi.stubEnv("NOMI_SETTINGS_DIR", "");
    const app = fakeApp(true);
    expect(registerNomiProtocolClient(app)).toBe(true);
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith("nomi");
    vi.unstubAllEnvs();
  });
});
