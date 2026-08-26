export {}

declare global {
  interface WebMcpToolDefinition {
    name: string
    description: string
    inputSchema: Record<string, unknown>
    annotations?: {
      readOnlyHint?: boolean
    }
    execute(input: Record<string, unknown>): unknown | Promise<unknown>
  }

  interface WebMcpModelContext {
    registerTool(
      tool: WebMcpToolDefinition,
      options?: { signal?: AbortSignal }
    ): void | Promise<void>
  }

  interface Document {
    modelContext?: WebMcpModelContext
  }
}
