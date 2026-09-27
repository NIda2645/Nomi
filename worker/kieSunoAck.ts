/**
 * KIE/Suno generation callbacks land here. The site worker only acknowledges them;
 * it never reads the body, headers or query string.
 *
 * Lives outside worker/index.ts on purpose: workerd loads every named export of the
 * entry module as an entrypoint and refuses to start on a plain value.
 */
export const ACK_PATH = "/api/vendor-callbacks/kie/suno/ack";
