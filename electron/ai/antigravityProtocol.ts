// Official contract: https://www.antigravity.google/docs/cli/headless/
// The init gate describes runtime tools; it is not an OS sandbox or a claim
// that user-installed startup hooks cannot run during CLI initialization.
export type AntigravityResult = {
  text: string;
  conversationId: string;
  usage: Record<string, number>;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ANTIGRAVITY_INVALID_PROTOCOL");
  return value as Record<string, unknown>;
}

export class AntigravityProtocol {
  private initialized = false;
  private conversationId = "";
  private text = "";
  private result?: AntigravityResult;

  constructor(
    private readonly onReady: () => void,
    private readonly onDelta: (delta: string) => void,
    private readonly expected: { agent: string; cwd: string; model?: string },
  ) {}

  accept(value: unknown): void {
    const event = record(value);
    if (this.result) throw new Error("ANTIGRAVITY_DUPLICATE_RESULT");
    if (event.event === "init") {
      const init = record(event.init);
      if (this.initialized
        || !Array.isArray(init.tools) || init.tools.length !== 0
        || init.agent !== this.expected.agent || init.cwd !== this.expected.cwd
        || (this.expected.model && init.model !== this.expected.model)
        || init.permission_mode !== "request-review") {
        throw new Error("ANTIGRAVITY_TEXT_ISOLATION_UNVERIFIED");
      }
      if (event.conversation_id !== undefined) this.pinConversation(event.conversation_id);
      this.initialized = true;
      this.onReady();
      return;
    }
    if (event.event === "result") {
      const result = record(event.result);
      if (result.status !== "SUCCESS") {
        const error = typeof result.error === "string" ? result.error : "";
        if (/authentication failed|authentication required|please sign in|not authenticated|login required/i.test(error)) {
          throw new Error("ANTIGRAVITY_LOGIN_REQUIRED");
        }
        throw new Error("ANTIGRAVITY_UNSUCCESSFUL_RESULT");
      }
    }
    if (!this.initialized) throw new Error("ANTIGRAVITY_INIT_REQUIRED");
    if (event.event === "step_update") {
      const step = record(event.step_update);
      if (step.step_type === "tool" || "tool_info" in step || "tool_name" in step || "subagent_info" in step) {
        throw new Error("ANTIGRAVITY_TOOLS_UNSUPPORTED");
      }
      this.pinConversation(step.conversation_id);
      if (!Number.isInteger(step.step_index) || Number(step.step_index) < 0
        || typeof step.state !== "string" || !["ACTIVE", "DONE"].includes(step.state)
        || typeof step.step_type !== "string" || !["user_input", "agent_response", "checkpoint"].includes(step.step_type)
        || ("text_delta" in step && typeof step.text_delta !== "string")) {
        throw new Error("ANTIGRAVITY_INVALID_STEP");
      }
      if (step.step_type === "agent_response" && typeof step.text_delta === "string") {
        this.text += step.text_delta;
        this.onDelta(step.text_delta);
      }
      return;
    }
    if (event.event !== "result") throw new Error("ANTIGRAVITY_UNSUPPORTED_EVENT");
    const result = record(event.result);
    if (result.status !== "SUCCESS" || "error" in result) throw new Error("ANTIGRAVITY_UNSUCCESSFUL_RESULT");
    this.pinConversation(result.conversation_id);
    if (result.num_turns !== 1 || typeof result.duration_seconds !== "number"
      || !Number.isFinite(result.duration_seconds) || result.duration_seconds < 0) throw new Error("ANTIGRAVITY_INVALID_RESULT");
    if (typeof result.response !== "string" || !result.response.trim()) throw new Error("ANTIGRAVITY_EMPTY_RESPONSE");
    // Do not silently splice a contradictory final result onto streamed text.
    if (!result.response.startsWith(this.text)) throw new Error("ANTIGRAVITY_RESPONSE_MISMATCH");
    const remaining = result.response.slice(this.text.length);
    const rawUsage = record(result.usage);
    const usage: Record<string, number> = {};
    for (const key of ["input_tokens", "output_tokens", "thinking_tokens", "cache_read_tokens", "total_tokens"]) {
      const count = rawUsage[key];
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) throw new Error("ANTIGRAVITY_INVALID_USAGE");
      usage[key] = count;
    }
    if (remaining) this.onDelta(remaining);
    this.result = { text: result.response, conversationId: this.conversationId, usage };
  }

  private pinConversation(value: unknown): void {
    if (typeof value !== "string" || !value || (this.conversationId && value !== this.conversationId)) {
      throw new Error("ANTIGRAVITY_CONVERSATION_MISMATCH");
    }
    this.conversationId = value;
  }

  finish(): AntigravityResult {
    if (!this.result) throw new Error("ANTIGRAVITY_MISSING_RESULT");
    return this.result;
  }

  get completed(): boolean { return Boolean(this.result); }
}
