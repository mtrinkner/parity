// Shared types for the PARITY deal-screening response shape

export type Unit = 'usd' | 'pct' | 'x' | 'count' | 'usd_month'

export type Provenance = 'actual' | 'seller' | 'calculated' | 'assumption'

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS' | 'INSUFFICIENT_DATA'

export interface PropertyInfo {
  name: string
  address: string
  submarket?: string | null
  broker?: string | null
  sourceOM?: string | null
  omDate?: string | null
}

export interface Counts {
  critical: number
  high: number
  medium: number
  low: number
  insufficientData: number
  pass: number
  flaggedTotal: number
  guardrailHits: number
}

export interface Metric {
  key: string
  label: string
  value: number | null
  unit: Unit
  provenance: Provenance
  omPage: string | null
  note?: string | null
  status?: string
}

export interface Flag {
  ruleId: string
  rule: string
  category: string
  status: string
  severity: Severity
  level: number
  weight: number
  pointsLost: number
  evidence: string
  omPage: string | null
  whyItMatters?: string | null
  financialImpact?: string | null
  recommendedNextAction?: string | null
  additionalDDRequired?: boolean
  guardrail?: boolean
}

export interface DealResponse {
  property: PropertyInfo
  score: number
  verdict: string
  verdictNote?: string
  dealRiskPosture?: string
  guardrailCapped?: boolean
  ruleSetVersion?: string
  counts: Counts
  topRisks: string[]
  metrics: Metric[]
  flags: Flag[]
  insufficientData: Flag[]
  passes: Flag[]
}

export interface ApiErrorResponse {
  error: {
    stage: string
    code: string
    message: string
    retryable: boolean
    detail?: Record<string, unknown>
  }
}
