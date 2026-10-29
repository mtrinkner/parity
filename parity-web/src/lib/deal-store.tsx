'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

import type { DealResponse } from './types'
import { sampleDeal } from './sample-deal'

export const WEBHOOK_URL = 'https://mtrinkner.app.n8n.cloud/webhook/om-screen'

interface DealContextValue {
  deal: DealResponse | null
  loading: boolean
  error: string | null
  loadSample: () => void
  clearDeal: () => void
  uploadOm: (file: File, dealName: string) => Promise<void>
}

const DealContext = createContext<DealContextValue | undefined>(undefined)

export const DealProvider = ({ children }: { children: ReactNode }) => {
  const [deal, setDeal] = useState<DealResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSample = useCallback(() => {
    setError(null)
    setDeal(sampleDeal)
  }, [])

  const clearDeal = useCallback(() => {
    setDeal(null)
    setError(null)
  }, [])

  const uploadOm = useCallback(async (file: File, dealName: string) => {
    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()

      formData.append('om_file', file)
      formData.append('deal_name', dealName)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 90_000)

      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      const json = await res.json()

      if (!res.ok || json?.error) {
        const message = json?.error?.message ?? `Request failed with status ${res.status}`

        setError(message)
        setLoading(false)

        return
      }

      setDeal(json as DealResponse)
      setLoading(false)
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'The request timed out. Large OMs can take 30-40 seconds to process — please try again.'
          : err instanceof Error
            ? err.message
            : 'Something went wrong uploading the OM.'

      setError(message)
      setLoading(false)
    }
  }, [])

  return (
    <DealContext.Provider value={{ deal, loading, error, loadSample, clearDeal, uploadOm }}>
      {children}
    </DealContext.Provider>
  )
}

export const useDeal = () => {
  const ctx = useContext(DealContext)

  if (!ctx) throw new Error('useDeal must be used within a DealProvider')

  return ctx
}
