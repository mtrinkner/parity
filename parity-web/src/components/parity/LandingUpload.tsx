'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'

import { useRouter } from 'next/navigation'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import LinearProgress from '@mui/material/LinearProgress'
import useMediaQuery from '@mui/material/useMediaQuery'

import { useDeal } from '@/lib/deal-store'

// Design tokens
const NAVY = '#0F172A'
const MUTED = '#64748B'
const PRIMARY = '#2563EB'
const PRIMARY_LIGHT = '#4C82F0'
const PRIMARY_DARK = '#1D4ED8'
const PAGE_BG = '#F8FAFC'
const CARD = '#FFFFFF'
const CRITICAL = '#EF4444'

const PROCESSING_STEPS = [
  'Uploading document…',
  'Extracting property data…',
  'Evaluating underwriting risks…',
  'Preparing deal review…'
]

const STEP_INTERVAL_MS = 4000

const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

/** "Example Tower OM.pdf" -> "Example Tower OM"; falls back to the raw filename. */
const deriveDealName = (file: File) => {
  const stripped = file.name.replace(/\.pdf$/i, '').trim()

  return stripped.length > 0 ? stripped : file.name
}

const LandingUpload = () => {
  const router = useRouter()
  const { deal, loading, error, uploadOm } = useDeal()

  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const [dragOver, setDragOver] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [exiting, setExiting] = useState(false)

  const message = validationError ?? error
  const busy = loading || exiting

  // Cycle the honest, high-level processing copy. Holds on the last line.
  useEffect(() => {
    if (!loading) {
      setStepIndex(0)

      return
    }

    const id = setInterval(() => {
      setStepIndex(prev => (prev < PROCESSING_STEPS.length - 1 ? prev + 1 : prev))
    }, STEP_INTERVAL_MS)

    return () => clearInterval(id)
  }, [loading])

  // Navigate ONLY once uploadOm has resolved with a deal and no error.
  useEffect(() => {
    if (!submitted || loading || error || !deal || exiting) return

    if (prefersReducedMotion) {
      router.push('/dashboard')

      return
    }

    setExiting(true)

    const id = setTimeout(() => router.push('/dashboard'), 600)

    return () => clearTimeout(id)
  }, [submitted, loading, error, deal, exiting, prefersReducedMotion, router])

  const handleFile = useCallback(
    (file: File | null | undefined) => {
      if (!file || busy) return

      if (!isPdf(file)) {
        setValidationError(`“${file.name}” is not a PDF. Upload the Offering Memorandum as a PDF file.`)

        return
      }

      setValidationError(null)
      setSubmitted(true)
      void uploadOm(file, deriveDealName(file))
    },
    [busy, uploadOm]
  )

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (busy) return
    dragDepth.current += 1
    setDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragOver(false)
    if (busy) return

    // Single file only.
    handleFile(e.dataTransfer.files?.[0])
  }

  const dropZoneBorder = message && !loading ? CRITICAL : dragOver ? PRIMARY : '#CBD5E1'

  return (
    <Box
      component='main'
      sx={{
        minBlockSize: '100dvh',
        inlineSize: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        px: { xs: 4, sm: 6, md: 8 },
        py: { xs: 10, md: 12 },
        backgroundColor: PAGE_BG,
        backgroundImage: `linear-gradient(180deg, #FDFEFF 0%, ${PAGE_BG} 45%, #EEF2F7 100%)`,
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'scale(0.985)' : 'scale(1)',
        filter: exiting ? 'blur(2px)' : 'none',
        transition: prefersReducedMotion
          ? 'none'
          : 'opacity 600ms ease-out, transform 600ms ease-out, filter 600ms ease-out'
      }}
    >
      {/* Faint architectural linework — pure CSS, desktop/tablet only. */}
      {['left', 'right'].map(side => (
        <Box
          key={side}
          aria-hidden
          sx={{
            display: { xs: 'none', sm: 'block' },
            position: 'absolute',
            insetBlock: 0,
            [side]: 0,
            inlineSize: { sm: '14%', lg: '18%' },
            pointerEvents: 'none',
            opacity: 0.5,
            backgroundImage: `repeating-linear-gradient(90deg, rgba(15,23,42,0.05) 0px, rgba(15,23,42,0.05) 1px, transparent 1px, transparent 46px),
              repeating-linear-gradient(0deg, rgba(15,23,42,0.035) 0px, rgba(15,23,42,0.035) 1px, transparent 1px, transparent 92px)`,
            maskImage:
              side === 'left'
                ? 'linear-gradient(90deg, rgba(0,0,0,0.65), transparent)'
                : 'linear-gradient(270deg, rgba(0,0,0,0.65), transparent)',
            WebkitMaskImage:
              side === 'left'
                ? 'linear-gradient(90deg, rgba(0,0,0,0.65), transparent)'
                : 'linear-gradient(270deg, rgba(0,0,0,0.65), transparent)'
          }}
        />
      ))}

      <Box sx={{ position: 'relative', inlineSize: '100%', maxInlineSize: 900, textAlign: 'center' }}>
        <Typography
          component='h1'
          sx={{
            color: NAVY,
            fontWeight: 700,
            lineHeight: 1,
            textTransform: 'uppercase',
            letterSpacing: { xs: '0.15em', md: '0.18em' },
            fontSize: { xs: '2.25rem', sm: '3.25rem', md: '4.25rem' },

            // Optical centering against the trailing letter-space.
            marginInlineStart: { xs: '0.15em', md: '0.18em' }
          }}
        >
          Parity
        </Typography>

        <Typography
          sx={{
            mt: 3,
            color: MUTED,
            textTransform: 'uppercase',
            letterSpacing: { xs: '0.16em', md: '0.22em' },
            fontSize: { xs: '0.6875rem', md: '0.8125rem' },
            fontWeight: 500
          }}
        >
          AI-Powered Multifamily Risk Review
        </Typography>

        <Box
          sx={{
            mt: { xs: 8, md: 10 },
            backgroundColor: CARD,
            border: '1px solid #E2E8F0',
            borderRadius: '18px',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -12px rgba(15,23,42,0.10)',
            p: { xs: 4, sm: 6, md: 8 }
          }}
        >
          <Box
            onDragEnter={handleDragEnter}
            onDragOver={e => {
              e.preventDefault()
            }}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            sx={{
              borderRadius: '12px',
              border: `2px dashed ${dropZoneBorder}`,
              backgroundColor: dragOver ? 'rgba(37,99,235,0.04)' : busy ? '#F8FAFC' : 'transparent',
              transition: prefersReducedMotion ? 'none' : 'border-color 180ms ease-out, background-color 180ms ease-out',
              px: { xs: 4, sm: 6 },
              py: { xs: 8, sm: 10, md: 12 },
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              opacity: busy ? 0.85 : 1,
              cursor: busy ? 'default' : 'default',
              '&:hover': busy ? undefined : { borderColor: PRIMARY_LIGHT }
            }}
          >
            <Box
              aria-hidden
              sx={{
                inlineSize: 56,
                blockSize: 56,
                borderRadius: '14px',
                backgroundColor: 'rgba(37,99,235,0.08)',
                color: PRIMARY,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem'
              }}
            >
              <i className='ri-upload-cloud-2-line' />
            </Box>

            {busy ? (
              <>
                <Typography
                  component='h2'
                  sx={{ mt: 5, color: NAVY, fontWeight: 700, fontSize: { xs: '1.25rem', md: '1.5rem' } }}
                >
                  Analyzing Offering Memorandum
                </Typography>
                <Typography sx={{ mt: 2, color: MUTED, fontSize: '0.9375rem' }}>
                  {PROCESSING_STEPS[stepIndex]}
                </Typography>
                <LinearProgress sx={{ mt: 6, inlineSize: '100%', maxInlineSize: 320, borderRadius: 999 }} />
              </>
            ) : (
              <>
                <Typography
                  component='h2'
                  sx={{ mt: 5, color: NAVY, fontWeight: 700, fontSize: { xs: '1.125rem', sm: '1.375rem', md: '1.5rem' } }}
                >
                  Drop your Offering Memorandum here
                </Typography>
                <Typography sx={{ mt: 2, color: MUTED, fontSize: { xs: '0.875rem', md: '0.9375rem' } }}>
                  Drag and drop your OM file to get started
                </Typography>

                <Button
                  variant='contained'
                  disableElevation
                  onClick={() => inputRef.current?.click()}
                  startIcon={<i className='ri-upload-2-line' />}
                  sx={{
                    mt: 6,
                    backgroundColor: PRIMARY,
                    color: '#FFFFFF',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    borderRadius: '10px',
                    px: 7,
                    py: 2.5,
                    transition: prefersReducedMotion ? 'none' : 'transform 140ms ease-out, background-color 140ms ease-out',
                    '&:hover': {
                      backgroundColor: PRIMARY_LIGHT,
                      transform: prefersReducedMotion ? 'none' : 'translateY(-1px)'
                    },
                    '&:active': {
                      backgroundColor: PRIMARY_DARK,
                      transform: prefersReducedMotion ? 'none' : 'translateY(1px) scale(0.99)'
                    },
                    '&.Mui-focusVisible, &:focus-visible': {
                      outline: `3px solid rgba(37,99,235,0.35)`,
                      outlineOffset: '2px'
                    },
                    '&.Mui-disabled': { backgroundColor: '#CBD5E1', color: '#FFFFFF' }
                  }}
                >
                  Upload OM
                </Button>
              </>
            )}

            <input
              ref={inputRef}
              id='om-file-input'
              type='file'
              accept='application/pdf'
              aria-label='Upload Offering Memorandum PDF'
              disabled={busy}
              style={{ display: 'none' }}
              onChange={e => {
                handleFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </Box>

          {/* Validation / processing / error announcements. */}
          <Box aria-live='polite' sx={{ mt: message ? 4 : 0 }}>
            {message && (
              <Alert severity='error' sx={{ textAlign: 'start' }}>
                {message}
              </Alert>
            )}
            {busy && (
              <Typography component='span' sx={{ position: 'absolute', inlineSize: 1, blockSize: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                Analyzing Offering Memorandum. {PROCESSING_STEPS[stepIndex]}
              </Typography>
            )}
          </Box>
        </Box>

        <Box
          sx={{
            mt: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            color: MUTED,
            fontSize: '0.8125rem'
          }}
        >
          <i className='ri-shield-check-line' aria-hidden />
          <span>Your data is secure and confidential</span>
        </Box>
      </Box>
    </Box>
  )
}

export default LandingUpload
