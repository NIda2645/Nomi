import type { AntigravityCapability } from "../shared/antigravity";
// Official contract: https://www.antigravity.google/docs/cli/headless/
// init.tools is the CLI's advertised inventory, not the selected agent's
// effective whitelist. The process owns the profile and checks selection logs.
export type AntigravityArtifact = { bytes: Uint8Array; mimeType: string; filename: string; width: number; height: number };
export type AntigravityToolStep = { index: number; name: string; state: "ACTIVE" | "DONE" };
export type AntigravityResult = {
  text: string;
  conversationId: string;
  usage: Record<string, number>;
  artifacts?: AntigravityArtifact[];
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
  private tools = new Map<number, AntigravityToolStep>();
  private turn = 1;

  constructor(
    private readonly onReady: () => void,
    private readonly onDelta: (delta: string) => void,
    private readonly expected: { agent: string; cwd: string; model?: string; capability?: AntigravityCapability; maxToolCalls?: number },
  ) {}

  accept(value: unknown): void {
    const event = record(value);
    if (this.result) throw new Error("ANTIGRAVITY_DUPLICATE_RESULT");
    if (event.event === "init") {
      const init = record(event.init);
      if (this.initialized
        || !Array.isArray(init.tools) || !init.tools.every((tool) => typeof tool === "string" && tool.length > 0)
        || init.agent !== this.expected.agent || init.cwd !== this.expected.cwd
        || (this.expected.model && init.model !== this.expected.model)
        || init.permission_mode !== "request-review") {
        throw new Error("ANTIGRAVITY_INVALID_INIT");
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
        if (/quota|rate.?limit|resource.exhausted|too many requests/i.test(error)) throw new Error("ANTIGRAVITY_QUOTA");
        throw new Error("ANTIGRAVITY_UNSUCCESSFUL_RESULT");
      }
    }
    if (!this.initialized) throw new Error("ANTIGRAVITY_INIT_REQUIRED");
    if (event.event === "step_update") {
      const step = record(event.step_update);
      if ("subagent_info" in step) throw new Error("ANTIGRAVITY_TOOLS_UNSUPPORTED");
      if (step.step_type === "tool" || "tool_info" in step || "tool_name" in step) {
        this.acceptTool(step); return;
      }
      this.pinConversation(step.conversation_id);
      if (!Number.isInteger(step.step_index) || Number(step.step_index) < 0
        || typeof step.state !== "string" || !["ACTIVE", "DONE"].includes(step.state)
        || typeof step.step_type !== "string" || !["user_input", "agent_response", "checkpoint", "error_message"].includes(step.step_type)
        || ("text_delta" in step && typeof step.text_delta !== "string")) {
        throw new Error("ANTIGRAVITY_INVALID_STEP");
      }
      // CLI 1.1.21 emits this terminal error category before e.g. a busy-server
      // result. Fail the run without treating provider failure as malformed text.
      if (step.step_type === "error_message") throw new Error("ANTIGRAVITY_UNSUCCESSFUL_RESULT");
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
    if (this.expected.capability && this.expected.capability !== "text"
      && (this.tools.size !== (this.expected.maxToolCalls ?? 1) || [...this.tools.values()].some((tool) => tool.state !== "DONE"))) {
      throw new Error("ANTIGRAVITY_MEDIA_INCOMPLETE");
    }
    if (result.num_turns !== this.turn || typeof result.duration_seconds !== "number"
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

  private acceptTool(step: Record<string, unknown>): void {
    const capability = this.expected.capability ?? "text";
    const allowed = capability === "vision" ? "view_file" : "generate_image";
    if (capability === "text" || step.step_type !== "tool" || !step.tool_info) throw new Error("ANTIGRAVITY_TOOLS_UNSUPPORTED");
    const info = record(step.tool_info);
    if (info.name !== allowed || ("tool_name" in step && step.tool_name !== allowed)) throw new Error("ANTIGRAVITY_TOOLS_UNSUPPORTED");
    this.pinConversation(step.conversation_id);
    if (!Number.isSafeInteger(step.step_index) || Number(step.step_index) < 0
      || typeof step.state !== "string" || !["ACTIVE", "DONE", "ERROR"].includes(step.state)) throw new Error("ANTIGRAVITY_INVALID_STEP");
    if (step.state === "ERROR" || info.error) {
      // The CLI can emit a generic timeout result after a precise tool error.
      // Classify here without exposing the upstream body or account diagnostics.
      const error = info.error && typeof info.error === "object" && !Array.isArray(info.error)
        ? info.error as Record<string, unknown> : undefined;
      if (typeof error?.message === "string" && /quota|rate.?limit|resource.exhausted|too many requests/i.test(error.message)) {
        throw new Error("ANTIGRAVITY_QUOTA");
      }
      throw new Error("ANTIGRAVITY_TOOL_FAILED");
    }
    const index = Number(step.step_index);
    const previous = this.tools.get(index);
    if (previous && (previous.name !== allowed || previous.state === "DONE")) throw new Error("ANTIGRAVITY_INVALID_STEP");
    if (!previous && this.tools.size >= (this.expected.maxToolCalls ?? 1)) throw new Error("ANTIGRAVITY_TOOL_BUDGET");
    this.tools.set(index, { index, name: allowed, state: step.state as "ACTIVE" | "DONE" });
  }

  get toolSteps(): AntigravityToolStep[] { return [...this.tools.values()].map((step) => ({ ...step })); }

  /** Only the process may advance after validating its private media initialization handshake. */
  nextTurn(capability: AntigravityCapability, maxToolCalls: number): void {
    if (!this.result || this.turn !== 1) throw new Error("ANTIGRAVITY_INVALID_RESULT");
    this.turn += 1; this.result = undefined; this.text = ""; this.tools.clear();
    this.expected.capability = capability; this.expected.maxToolCalls = maxToolCalls;
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
