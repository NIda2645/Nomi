import type { Dispatcher } from 'undici';
import { getAppDispatcher } from './systemProxy';
import { withCredentialRedirectPolicy } from './credentialRedirectPolicy';

// Own the implementation, not a route snapshot: later SDK global installs
// cannot replace native Request/Response handling or the fetch implementation.
const nativeFetch = globalThis.fetch.bind(globalThis);
const NativeRequest = globalThis.Request;

/**
 * The sole Node HTTP entry. Keep native Request/Response/FormData together;
 * only inject Nomi's current dispatcher, never a third-party global route.
 * No body reads, wrapping errors, retries or timeout policy here.
 *
 * Credentialed requests never auto-follow a redirect; the rule and its reasons live in
 * credentialRedirectPolicy.ts (this is only where it is applied).
 */
export const appFetch: typeof globalThis.fetch = async (input, init) => {
  const signal = init?.signal === undefined
    ? (input instanceof NativeRequest ? input.signal : undefined) : init.signal;
  const target = input instanceof NativeRequest ? input.url : String(input);
  const suppliedDispatcher = (init as RequestInit & { dispatcher?: Dispatcher } | undefined)?.dispatcher;
  const dispatcher = suppliedDispatcher ?? await getAppDispatcher(signal ?? undefined, target);
  const options: RequestInit & { dispatcher: Dispatcher } = { ...withCredentialRedirectPolicy(input, init), dispatcher };
  return nativeFetch(input, options);
};
