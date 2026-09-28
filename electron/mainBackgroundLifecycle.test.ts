import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

describe("background window lifecycle ownership", () => {
  it("restores throttling and marks the idle owner only from BrowserWindow show", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "electron/main.ts"), "utf8")
    expect(source).toContain('mainWindow.on("show", () => {')
    expect(source).toContain("backgroundIdleExit?.markWindowShown()")
    expect(source).toContain("mainWindow.webContents.setBackgroundThrottling(true)")
    expect(source).toContain("backgroundThrottling: !isBackgroundLaunch")
    expect(source).not.toContain("onWindowShown:")
  })
})
