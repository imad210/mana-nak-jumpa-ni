import { validateRoutingLocationsPayload } from './routing-midpoint'
import type { Location, MidpointMode } from './utils'

export const WEBMCP_TOOL_NAMES = [
  'search_locations',
  'set_participants',
  'get_current_plan',
  'compare_midpoint_modes',
  'apply_meetup_plan'
] as const

export interface WebMcpActions {
  getRevision(): number
  searchLocations(query: string): Promise<Location[]>
  setParticipants(participants: Location[]): unknown | Promise<unknown>
  getCurrentPlan(): unknown | Promise<unknown>
  compareMidpointModes(): unknown | Promise<unknown>
  applyMeetupPlan(mode: MidpointMode, expectedRevision?: number): unknown | Promise<unknown>
}

export class WebMcpActionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
    public readonly field?: string
  ) {
    super(message)
    this.name = 'WebMcpActionError'
  }
}

interface ToolResult<T = unknown> {
  ok: boolean
  code: string
  message: string
  revision: number
  data?: T
  error?: {
    field?: string
    retryable: boolean
  }
}

function success<T>(actions: WebMcpActions, code: string, message: string, data: T): ToolResult<T> {
  return {
    ok: true,
    code,
    message,
    revision: actions.getRevision(),
    data
  }
}

function failure(actions: WebMcpActions, error: unknown): ToolResult {
  if (error instanceof WebMcpActionError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      revision: actions.getRevision(),
      error: {
        ...(error.field ? { field: error.field } : {}),
        retryable: error.retryable
      }
    }
  }

  console.error('[webmcp] tool execution failed:', error)
  return {
    ok: false,
    code: 'unexpected_error',
    message: 'The operation could not be completed.',
    revision: actions.getRevision(),
    error: { retryable: true }
  }
}

function getObjectInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new WebMcpActionError('invalid_input', 'Tool input must be an object.')
  }
  return input as Record<string, unknown>
}

async function executeSafely<T>(actions: WebMcpActions, execute: () => Promise<T>) {
  try {
    return await execute()
  } catch (error) {
    return failure(actions, error)
  }
}

export async function registerMeetupTools(
  modelContext: WebMcpModelContext,
  actions: WebMcpActions,
  signal?: AbortSignal
) {
  const registrationOptions = signal ? { signal } : undefined

  const tools: WebMcpToolDefinition[] = [
    {
      name: 'search_locations',
      description: 'Search for Malaysian locality or address candidates without changing the current map.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            minLength: 2,
            maxLength: 120,
            description: 'A Malaysian locality or address fragment to search for.'
          }
        },
        required: ['query'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => executeSafely(actions, async () => {
        const { query } = getObjectInput(input)
        if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 120) {
          throw new WebMcpActionError('invalid_query', 'Query must contain between 2 and 120 characters.', false, 'query')
        }

        const normalizedQuery = query.trim()
        const candidates = await actions.searchLocations(normalizedQuery)
        return success(
          actions,
          candidates.length > 0 ? 'locations_found' : 'no_locations_found',
          candidates.length > 0 ? `Found ${candidates.length} location candidates.` : 'No matching locations were found.',
          { query: normalizedQuery, candidates }
        )
      })
    },
    {
      name: 'set_participants',
      description: 'Replace the visible map participants with 2 to 10 exact locations and clear the previous plan.',
      inputSchema: {
        type: 'object',
        properties: {
          participants: {
            type: 'array',
            minItems: 2,
            maxItems: 10,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 160 },
                lat: { type: 'number', minimum: -90, maximum: 90 },
                lng: { type: 'number', minimum: -180, maximum: 180 }
              },
              required: ['name', 'lat', 'lng'],
              additionalProperties: false
            }
          }
        },
        required: ['participants'],
        additionalProperties: false
      },
      execute: async (input) => executeSafely(actions, async () => {
        const { participants } = getObjectInput(input)
        const validatedParticipants = validateRoutingLocationsPayload(participants)
        if (!validatedParticipants) {
          throw new WebMcpActionError(
            'invalid_participants',
            'Participants must contain 2 to 10 unique locations with valid names and coordinates.',
            false,
            'participants'
          )
        }

        const data = await actions.setParticipants(validatedParticipants)
        return success(actions, 'participants_set', 'Participants were added to the shared map.', data)
      })
    },
    {
      name: 'get_current_plan',
      description: 'Read the participant and meetup plan state currently visible in the application.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async () => executeSafely(actions, async () => {
        const data = await actions.getCurrentPlan()
        return success(actions, 'plan_state_returned', 'Current meetup plan state returned.', data)
      })
    },
    {
      name: 'compare_midpoint_modes',
      description: 'Compare the geographic midpoint with the road-aware fairness result for the current participants without applying a mode.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async () => executeSafely(actions, async () => {
        const data = await actions.compareMidpointModes()
        return success(actions, 'midpoints_compared', 'Geographic and road-aware midpoint modes were compared.', data)
      })
    },
    {
      name: 'apply_meetup_plan',
      description: 'Apply a confirmed geographic or road-aware meetup plan to the visible map and sidebar.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['geographic', 'routing'],
            description: 'The midpoint mode confirmed by the user.'
          },
          expectedRevision: {
            type: 'integer',
            minimum: 0,
            description: 'Optional revision from a previous comparison to reject stale changes.'
          }
        },
        required: ['mode'],
        additionalProperties: false
      },
      execute: async (input) => executeSafely(actions, async () => {
        const { mode, expectedRevision } = getObjectInput(input)
        if (mode !== 'geographic' && mode !== 'routing') {
          throw new WebMcpActionError('invalid_mode', 'Mode must be geographic or routing.', false, 'mode')
        }
        if (expectedRevision != null && (!Number.isInteger(expectedRevision) || (expectedRevision as number) < 0)) {
          throw new WebMcpActionError('invalid_revision', 'expectedRevision must be a non-negative integer.', false, 'expectedRevision')
        }

        const data = await actions.applyMeetupPlan(mode, expectedRevision as number | undefined)
        return success(actions, 'meetup_plan_applied', `Applied the ${mode} meetup plan to the shared map.`, data)
      })
    }
  ]

  await Promise.all(tools.map((tool) => Promise.resolve(modelContext.registerTool(tool, registrationOptions))))
}
