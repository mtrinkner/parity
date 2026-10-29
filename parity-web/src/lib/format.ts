import type { Unit } from './types'

export const formatMetricValue = (value: number | null | undefined, unit: Unit): string => {
  if (value === null || value === undefined) return 'Insufficient Data'

  switch (unit) {
    case 'usd':
      return `$${Math.round(value).toLocaleString('en-US')}`
    case 'usd_month':
      return `$${Math.round(value).toLocaleString('en-US')}/mo`
    case 'pct':
      return `${(value * 100).toFixed(2)}%`
    case 'x':
      return `${value.toFixed(2)}x`
    case 'count':
      return value.toLocaleString('en-US')
    default:
      return String(value)
  }
}

export const severityColor = (severity: string): 'error' | 'warning' | 'success' | 'secondary' | 'default' => {
  switch (severity) {
    case 'CRITICAL':
      return 'error'
    case 'HIGH':
      return 'warning'
    case 'MEDIUM':
      return 'warning'
    case 'LOW':
      return 'warning'
    case 'PASS':
      return 'success'
    case 'INSUFFICIENT_DATA':
    default:
      return 'secondary'
  }
}

// Hex values used for chart series where MUI color prop can't be used directly
export const severityHex = (severity: string): string => {
  switch (severity) {
    case 'CRITICAL':
      return '#EF4444'
    case 'HIGH':
      return '#F97316'
    case 'MEDIUM':
      return '#F59E0B'
    case 'LOW':
      return '#EAB308'
    case 'PASS':
      return '#22C55E'
    case 'INSUFFICIENT_DATA':
    default:
      return '#9CA3AF'
  }
}

export const scoreColor = (score: number): string => {
  if (score >= 75) return '#22C55E'
  if (score >= 50) return '#F59E0B'

  return '#EF4444'
}
