import { describe, expect, it, vi } from 'vitest'
import { registerMeetupTools, WEBMCP_TOOL_NAMES, WebMcpActionError, type WebMcpActions } from './webmcp'

function createHarness() {
  const tools = new Map<string, WebMcpToolDefinition>()
  let revision = 0
  const actions: WebMcpActions = {
    getRevision: () => revision,
    searchLocations: vi.fn(async () => [{ name: 'Bangi, Malaysia', lat: 2.96, lng: 101.75 }]),
    setParticipants: vi.fn((participants) => {
      revision += 1
      return { participantCount: participants.length, status: 'ready' }
    }),
    getCurrentPlan: vi.fn(() => ({ status: 'ready' })),
    compareMidpointModes: vi.fn(() => ({ participantCount: 2 })),
    applyMeetupPlan: vi.fn((mode, expectedRevision) => {
      if (expectedRevision != null && expectedRevision !== revision) {
        throw new WebMcpActionError('stale_revision', 'The plan changed after it was compared.')
      }
      revision += 1
      return { selectedMode: mode, status: 'applied' }
    })
  }
  const modelContext: WebMcpModelContext = {
    registerTool: vi.fn((tool) => {
      tools.set(tool.name, tool)
    })
  }

  return { tools, actions, modelContext }
}

describe('WebMCP tool registration', () => {
  it('registers the five documented tools with stable unique names', async () => {
    const harness = createHarness()
    await registerMeetupTools(harness.modelContext, harness.actions)
    expect([...harness.tools.keys()].sort()).toEqual([...WEBMCP_TOOL_NAMES].sort())
    expect(harness.tools.get('search_locations')?.annotations?.readOnlyHint).toBe(true)
    expect(harness.tools.get('set_participants')?.annotations?.readOnlyHint).not.toBe(true)
  })

  it('searches locations without changing the revision', async () => {
    const harness = createHarness()
    await registerMeetupTools(harness.modelContext, harness.actions)

    const result = await harness.tools.get('search_locations')?.execute({ query: 'Bangi' }) as {
      ok: boolean
      code: string
      revision: number
      data: { candidates: unknown[] }
    }

    expect(result).toMatchObject({ ok: true, code: 'locations_found', revision: 0 })
    expect(result.data.candidates).toHaveLength(1)
  })

  it('rejects invalid participants before mutating application state', async () => {
    const harness = createHarness()
    await registerMeetupTools(harness.modelContext, harness.actions)

    const result = await harness.tools.get('set_participants')?.execute({
      participants: [{ name: 'Only one', lat: 3, lng: 101 }]
    }) as { ok: boolean; code: string; revision: number }

    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'invalid_participants', revision: 0 }))
    expect(harness.actions.setParticipants).not.toHaveBeenCalled()
  })

  it('returns the incremented revision after a state-changing tool', async () => {
    const harness = createHarness()
    await registerMeetupTools(harness.modelContext, harness.actions)

    const result = await harness.tools.get('set_participants')?.execute({
      participants: [
        { name: 'Bangi', lat: 2.96, lng: 101.75 },
        { name: 'Cyberjaya', lat: 2.92, lng: 101.65 }
      ]
    }) as { ok: boolean; revision: number }

    expect(result).toMatchObject({ ok: true, revision: 1 })
  })

  it('returns a structured stale-revision error', async () => {
    const harness = createHarness()
    await registerMeetupTools(harness.modelContext, harness.actions)

    const result = await harness.tools.get('apply_meetup_plan')?.execute({
      mode: 'routing',
      expectedRevision: 2
    }) as { ok: boolean; code: string; error: { retryable: boolean } }

    expect(result).toMatchObject({
      ok: false,
      code: 'stale_revision',
      error: { retryable: false }
    })
  })
})
