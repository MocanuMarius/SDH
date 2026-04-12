import type { ErrorType } from '../types/database'

export const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  analytical: 'Analytical',
  informational: 'Informational',
  behavioral: 'Behavioral',
  sizing: 'Sizing',
  timing: 'Timing',
}
