/** Shared colour + letter identity for each participant, used by both the list and the map. */
const PARTICIPANT_COLORS = [
  '#3b82f6', // blue
  '#f43f5e', // rose
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#d946ef', // fuchsia
  '#84cc16', // lime
  '#0d9488', // teal
  '#6366f1', // indigo
  '#64748b' // slate
]

export const MIDPOINT_COLOR = '#f59e0b'

export function getParticipantColor(index: number) {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length]
}

export function getParticipantLetter(index: number) {
  return String.fromCharCode(65 + (index % 26))
}
