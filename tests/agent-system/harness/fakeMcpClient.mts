export type FakeMcpToolDefinition = {
  name: string
  description?: string
  handler: (input: unknown) => unknown | Promise<unknown>
}

export type FakeMcpCallRecord = {
  callId: string
  name: string
  input: unknown
  output: unknown
  error?: string
}

export type FakeMcpClient = {
  registerTool: (tool: FakeMcpToolDefinition) => void
  listTools: () => readonly Omit<FakeMcpToolDefinition, 'handler'>[]
  callTool: (name: string, input: unknown) => Promise<unknown>
  disconnect: () => void
  reconnect: () => void
  calls: () => readonly FakeMcpCallRecord[]
}

export function createFakeMcpClient(initialTools: readonly FakeMcpToolDefinition[] = []): FakeMcpClient {
  const tools = new Map<string, FakeMcpToolDefinition>()
  const calls: FakeMcpCallRecord[] = []
  let connected = true
  let callSequence = 0

  function assertConnected(): void {
    if (!connected) throw new Error('Fake MCP client is disconnected')
  }

  function registerTool(tool: FakeMcpToolDefinition): void {
    if (tools.has(tool.name)) throw new Error(`Duplicate fake MCP tool: ${tool.name}`)
    tools.set(tool.name, tool)
  }

  for (const tool of initialTools) registerTool(tool)

  async function callTool(name: string, input: unknown): Promise<unknown> {
    assertConnected()
    const tool = tools.get(name)
    if (!tool) throw new Error(`Unknown fake MCP tool: ${name}`)
    const callId = `mcp-call-${++callSequence}`
    try {
      const output = await tool.handler(structuredClone(input))
      calls.push({
        callId,
        name,
        input: structuredClone(input),
        output: structuredClone(output),
      })
      return output
    } catch (error) {
      calls.push({
        callId,
        name,
        input: structuredClone(input),
        output: undefined,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  return {
    registerTool,
    listTools: () => [...tools.values()].map(({ handler: _handler, ...tool }) => structuredClone(tool)),
    callTool,
    disconnect: () => {
      connected = false
    },
    reconnect: () => {
      connected = true
    },
    calls: () => calls.map((call) => structuredClone(call)),
  }
}
