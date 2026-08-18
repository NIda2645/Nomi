import { ipcMain } from "electron";

import {
  readGenerationModelDefaults,
  writeGenerationModelDefaults,
  type GenerationModelDefaults,
} from "./generationModelDefaultsSettings";

export type GenerationModelDefaultsStore = {
  read: () => GenerationModelDefaults;
  write: (value: unknown) => GenerationModelDefaults;
};

export function registerGenerationModelDefaultsIpc(
  store: GenerationModelDefaultsStore = {
    read: readGenerationModelDefaults,
    write: writeGenerationModelDefaults,
  },
): void {
  ipcMain.handle("nomi:settings:generation-model-defaults-get", async () => store.read());
  ipcMain.handle(
    "nomi:settings:generation-model-defaults-set",
    async (_event, payload: unknown) => store.write(payload),
  );
}
