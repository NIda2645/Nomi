import { ipcMain } from "electron";

import {
  readSystemPromptOverrides,
  writeSystemPromptOverrides,
  type SystemPromptOverrides,
} from "./systemPromptsSettings";

export type SystemPromptOverridesStore = {
  read: () => SystemPromptOverrides;
  write: (value: unknown) => SystemPromptOverrides;
};

export function registerSystemPromptsIpc(
  store: SystemPromptOverridesStore = {
    read: readSystemPromptOverrides,
    write: writeSystemPromptOverrides,
  },
): void {
  ipcMain.handle("nomi:settings:system-prompts-get", async () => store.read());
  ipcMain.handle("nomi:settings:system-prompts-set", async (_event, payload: unknown) => store.write(payload));
}
