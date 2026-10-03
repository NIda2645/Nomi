import { vi } from 'vitest';
import { withCredentialRedirectPolicy } from '../../electron/credentialRedirectPolicy';

// Domain unit tests already own their HTTP fixtures through global fetch. They
// do not start Electron or apply real user proxy preferences. Transport tests
// explicitly unmock appFetch; the cold Electron regression uses real modules.
// This fixture isolates existing business assertions; it proves no real route.
// The credential redirect rule is applied here too (same owner function as the
// real entry), so domain tests do not run under a looser policy than production.
vi.mock('../../electron/appFetch', () => ({
  appFetch: (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) =>
    globalThis.fetch(input, withCredentialRedirectPolicy(input, init)),
}));
