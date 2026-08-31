import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  browserChromeMenuHtml,
  browserChromeMenuPreloadPath,
  cancelBrowserChromeMenu,
  normalizeBrowserChromeMenuPayload,
  selectBrowserChromeMenu,
  showBrowserChromeMenu,
} from "./browserViewChromeMenu";

// 假窗口刻意比真 Electron 更严格，好让「拆窗后还碰窗口」当场炸出来而不是静默过关：
// ① webContents.id 在销毁后读就抛（Electron 文档：收到 closed 后就不该再用这个对象）；
// ② close() 同步派发 closed（真实是异步），把重入路径压到最坏情况。
const harness = vi.hoisted(() => {
  type Listener = () => void;
  let nextId = 1;

  class FakeWebContents {
    readonly rawId = nextId++;
    destroyed = false;
    private readonly listeners = new Map<string, Listener[]>();

    get id(): number {
      if (this.destroyed) throw new Error("Object has been destroyed");
      return this.rawId;
    }

    once(event: string, listener: Listener): void {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    }

    setWindowOpenHandler(): void {}

    executeJavaScript(): Promise<void> {
      return Promise.resolve();
    }
  }

  class FakeBrowserWindow {
    readonly id = nextId++;
    readonly webContents = new FakeWebContents();
    readonly options: Record<string, unknown>;
    closeCalls = 0;
    destroyCalls = 0;
    private destroyed = false;
    private readonly listeners = new Map<string, Listener[]>();

    constructor(options: Record<string, unknown> = {}) {
      this.options = options;
      harness.created.push(this);
    }

    once(event: string, listener: Listener): void {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    }

    emit(event: string): void {
      const listeners = this.listeners.get(event) ?? [];
      this.listeners.delete(event); // once 语义：同一事件不会把同一个 handler 打两遍
      for (const listener of listeners) listener();
    }

    private teardown(): void {
      if (this.destroyed) return;
      this.destroyed = true;
      this.webContents.destroyed = true;
      this.emit("closed");
    }

    close(): void {
      this.closeCalls += 1;
      this.teardown();
    }

    destroy(): void {
      this.destroyCalls += 1;
      this.teardown();
    }

    isDestroyed(): boolean {
      return this.destroyed;
    }

    getContentBounds(): { x: number; y: number; width: number; height: number } {
      return { x: 100, y: 50, width: 1200, height: 800 };
    }

    setMenuBarVisibility(): void {}

    show(): void {}

    loadURL(): Promise<void> {
      return Promise.resolve();
    }
  }

  return { created: [] as FakeBrowserWindow[], FakeBrowserWindow };
});

vi.mock("electron", () => ({ BrowserWindow: harness.FakeBrowserWindow }));

/** 排到我们那个 setImmediate 之后：先入先出，回调跑完才 resolve。 */
function flushImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function openMenu(): {
  owner: InstanceType<typeof harness.FakeBrowserWindow>;
  menu: InstanceType<typeof harness.FakeBrowserWindow>;
  result: Promise<{ id: string | null }>;
} {
  const owner = new harness.FakeBrowserWindow();
  const payload = normalizeBrowserChromeMenuPayload({
    x: 12,
    y: 34,
    width: 240,
    items: [{ id: "open", label: "打开", enabled: true }],
  });
  const result = showBrowserChromeMenu(owner as never, payload);
  const menu = harness.created[harness.created.length - 1];
  return { owner, menu, result };
}

beforeEach(() => {
  harness.created.length = 0;
});

describe("browser chrome menu window", () => {
  it("resolves the shared preload from the compiled browser/chrome directory", () => {
    expect(browserChromeMenuPreloadPath("/app/dist-electron/browser/chrome")).toBe(
      path.join("/app/dist-electron", "preload.js"),
    );
  });

  it("ships no inline script and escapes menu content", () => {
    const html = browserChromeMenuHtml([
      { type: "normal", id: 'open"unsafe', label: "<打开>", description: "说明", enabled: true },
    ]);

    expect(html).toContain("default-src 'none'; style-src 'unsafe-inline'");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;打开&gt;");
    expect(html).not.toContain('data-id="open"unsafe"');
  });
});

describe("browser chrome menu teardown", () => {
  it("settles blur synchronously but defers the native close off the focus transition", async () => {
    const { menu, result } = openMenu();

    menu.emit("blur");
    // 同步快照：结算已完成、原生窗口还没动——这正是「不在焦点转移途中拆窗」的可观测形态。
    const closeCallsInsideBlur = menu.closeCalls;

    await expect(result).resolves.toEqual({ id: null });
    expect(closeCallsInsideBlur).toBe(0);

    await flushImmediate();
    expect(menu.closeCalls).toBe(1);
  });

  it("closes exactly once when the deferred close re-enters through the closed event", async () => {
    const { menu, result } = openMenu();

    menu.emit("blur");
    await flushImmediate(); // close() → 同步派发 closed → 再次进入关闭逻辑
    await expect(result).resolves.toEqual({ id: null });

    expect(menu.closeCalls).toBe(1);
    expect(menu.destroyCalls).toBe(0);
  });

  it("ignores a select that lands after blur already settled the menu", async () => {
    const { menu, result } = openMenu();
    const webContentsId = menu.webContents.id;

    menu.emit("blur");
    selectBrowserChromeMenu(webContentsId, "open"); // 迟到的 IPC 不得改写结果
    cancelBrowserChromeMenu(webContentsId);

    await expect(result).resolves.toEqual({ id: null });
    await flushImmediate();
    expect(menu.closeCalls).toBe(1);
  });

  it("makes the deferred close a no-op when the window is already destroyed", async () => {
    const { menu, result } = openMenu();

    menu.emit("blur");
    menu.destroy(); // owner 关闭/系统拆窗抢在这一轮事件循环之前
    await expect(result).resolves.toEqual({ id: null });

    await flushImmediate();
    expect(menu.destroyCalls).toBe(1);
    expect(menu.closeCalls).toBe(0); // 绝不对已销毁窗口调 close()
  });

  it("settles without touching webContents when the owner tears the menu down first", async () => {
    const { owner, menu, result } = openMenu();

    // owner 关闭那条路径是「先 destroy 菜单窗、再结算」：结算若还去读 window.webContents.id，
    // 这里就会抛（假窗口按 Electron 文档语义在销毁后让 id 抛）。
    owner.emit("closed");

    await expect(result).resolves.toEqual({ id: null });
    expect(menu.destroyCalls).toBe(1);
    expect(menu.closeCalls).toBe(0);
  });

  it("selecting an item resolves with that id and closes the window once", async () => {
    const { menu, result } = openMenu();

    selectBrowserChromeMenu(menu.webContents.id, "open");

    await expect(result).resolves.toEqual({ id: "open" });
    expect(menu.closeCalls).toBe(1);
  });
});
