'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { createPortal } from 'react-dom'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// The hero video is 6.0s. We drive currentTime entirely from scroll — it never autoplays.
// The stage is a fixed, full-viewport scroll container with a ~500vh spacer; a sticky video
// fills the viewport. Using an internal scroll container (not window) fully isolates the hero
// from the dashboard layout so it renders full-bleed over the sidebar/navbar.
const SCROLL_MULTIPLIER = 5 // spacer height = 5 * viewport (~500vh)
const TIME_EPSILON = 0.05 // stay away from exact duration to avoid loop/stall
const LERP = 0.12 // interpolation toward the scroll-derived target time

interface OverlayCopy {
  start: number
  end: number
  lines: string[]
}

const COPY: OverlayCopy[] = [
  { start: 0.0, end: 0.22, lines: ['From offering memorandum', 'to investment clarity.'] },
  { start: 0.4, end: 0.62, lines: ['Upload once.', 'Screen the entire deal.'] },
  { start: 0.78, end: 1.0, lines: ['20 rules.', 'Every flag traceable.', 'One clear verdict.'] }
]

const copyOpacity = (progress: number, block: OverlayCopy): number => {
  const { start, end } = block

  if (progress < start || progress > end) return 0

  const span = end - start
  const local = (progress - start) / span
  const fade = 0.32

  if (local < fade) return local / fade
  if (local > 1 - fade) return (1 - local) / fade

  return 1
}

type Phase = 'hero' | 'handoff' | 'done'

interface ScrollHeroProps {
  onComplete: () => void
}

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')

    setReduced(mq.matches)

    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)

    mq.addEventListener('change', handler)

    return () => mq.removeEventListener('change', handler)
  }, [])

  return reduced
}

const ScrollHero = ({ onComplete }: ScrollHeroProps) => {
  const reducedMotion = useReducedMotion()

  const scrollRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Per-frame values in refs to avoid re-renders.
  const durationRef = useRef(0)
  const targetTimeRef = useRef(0)
  const currentTimeRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const metricsRef = useRef({ height: 0 }) // cached scrollable range (scrollHeight - clientHeight)
  const progressRef = useRef(0)

  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<Phase>('hero')
  const [videoFailed, setVideoFailed] = useState(false)
  const [mounted, setMounted] = useState(false)

  const blocks = useMemo(() => COPY, [])

  useEffect(() => setMounted(true), [])

  // Lock body scroll while the hero owns the screen.
  useEffect(() => {
    if (phase === 'done') return
    const prev = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = prev
    }
  }, [phase])

  // ---- Scroll-scrub engine (skipped entirely under reduced motion) ----
  useEffect(() => {
    if (reducedMotion || !mounted) return

    const container = scrollRef.current
    const video = videoRef.current

    if (!container || !video) return

    let metadataReady = false

    const measure = () => {
      metricsRef.current = { height: container.scrollHeight - container.clientHeight }
    }

    const onLoadedMetadata = () => {
      metadataReady = true
      durationRef.current = video.duration || 6
    }

    if (video.readyState >= 1 && video.duration) {
      onLoadedMetadata()
    } else {
      video.addEventListener('loadedmetadata', onLoadedMetadata)
    }

    const onError = () => setVideoFailed(true)

    video.addEventListener('error', onError)

    const computeProgress = () => {
      const { height } = metricsRef.current

      if (height <= 0) return 0

      return Math.min(1, Math.max(0, container.scrollTop / height))
    }

    const onScroll = () => {
      const p = computeProgress()

      progressRef.current = p

      if (metadataReady) {
        const dur = durationRef.current

        targetTimeRef.current = Math.min(dur - TIME_EPSILON, Math.max(0, p * dur))
      }
    }

    const tick = () => {
      if (metadataReady) {
        const cur = currentTimeRef.current
        const target = targetTimeRef.current
        const next = cur + (target - cur) * LERP

        currentTimeRef.current = next

        if (Math.abs(next - (video.currentTime || 0)) > 0.008) {
          try {
            video.currentTime = next
          } catch {
            /* seeking may throw before buffered — ignore */
          }
        }
      }

      const p = progressRef.current

      setProgress(prev => (Math.abs(prev - p) > 0.004 ? p : prev))

      rafRef.current = requestAnimationFrame(tick)
    }

    measure()
    onScroll()

    container.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      container.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('error', onError)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [reducedMotion, mounted])

  // Trigger handoff when scrubbed to the end.
  useEffect(() => {
    if (reducedMotion) return
    if (phase === 'hero' && progress >= 0.995) setPhase('handoff')
  }, [progress, phase, reducedMotion])

  // Handoff animation completes, then hero unmounts.
  useEffect(() => {
    if (phase !== 'handoff') return

    const t = setTimeout(() => {
      setPhase('done')
      onComplete()
    }, 900)

    return () => clearTimeout(t)
  }, [phase, onComplete])

  const enterDashboard = () => {
    setPhase('handoff')
    setTimeout(() => {
      setPhase('done')
      onComplete()
    }, 700)
  }

  if (!mounted || phase === 'done') return null

  const handoff = phase === 'handoff'

  // ================= Reduced-motion / no-scrub path =================
  if (reducedMotion) {
    return createPortal(
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          bgcolor: '#0b1220',
          backgroundImage: 'url(/hero-poster.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          px: 4,
          opacity: handoff ? 0 : 1,
          transition: 'opacity 0.6s ease',
          pointerEvents: handoff ? 'none' : 'auto'
        }}
      >
        <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(6,12,24,0.55)' }} />
        <Box sx={{ position: 'relative', color: '#fff', maxWidth: 720 }}>
          <Typography sx={{ fontWeight: 300, fontSize: { xs: 30, md: 46 }, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
            From offering memorandum
          </Typography>
          <Typography
            sx={{ fontWeight: 600, fontSize: { xs: 30, md: 46 }, lineHeight: 1.15, letterSpacing: '-0.02em', mb: 5 }}
          >
            to investment clarity.
          </Typography>
          <Typography sx={{ opacity: 0.85, fontWeight: 300, fontSize: { xs: 15, md: 18 }, mb: 5 }}>
            20 rules. Every flag traceable. One clear verdict.
          </Typography>
          <Button
            variant='contained'
            size='large'
            onClick={enterDashboard}
            sx={{ px: 5, py: 1.5, borderRadius: 2, textTransform: 'none', fontSize: 16 }}
          >
            Enter PARITY
          </Button>
        </Box>
      </Box>,
      document.body
    )
  }

  // ================= Full scroll-scrub experience =================
  return createPortal(
    <Box
      ref={scrollRef}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        overflowY: handoff ? 'hidden' : 'auto',
        overflowX: 'hidden',
        bgcolor: '#0b1220',
        scrollbarWidth: 'none', // hide native scrollbar for a cleaner cinematic feel
        '&::-webkit-scrollbar': { display: 'none' }
      }}
    >
      {/* Tall spacer that produces the scroll range */}
      <Box sx={{ height: handoff ? '100vh' : `${SCROLL_MULTIPLIER * 100}vh`, position: 'relative' }}>
        {/* Sticky viewport-filling stage */}
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            height: '100vh',
            width: '100%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {/* The video "monitor" that expands into the browser on handoff */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              transformOrigin: 'center center',
              transform: handoff ? 'scale(1.06)' : 'scale(1)',
              borderRadius: handoff ? 0 : 2,
              opacity: handoff ? 0 : 1,
              overflow: 'hidden',
              transition: 'transform 0.9s cubic-bezier(0.22,1,0.36,1), opacity 0.75s ease, border-radius 0.9s ease'
            }}
          >
            {!videoFailed ? (
              <video
                ref={videoRef}
                muted
                playsInline
                preload='auto'
                poster='/hero-poster.jpg'
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              >
                <source src='/hero.mp4' type='video/mp4' />
              </video>
            ) : (
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  backgroundImage: 'url(/hero-poster.jpg)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              />
            )}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(180deg, rgba(6,12,24,0.35) 0%, rgba(6,12,24,0.12) 40%, rgba(6,12,24,0.5) 100%)'
              }}
            />
          </Box>

          {/* Overlay copy */}
          {!handoff &&
            blocks.map((block, i) => {
              const opacity = copyOpacity(progress, block)

              if (opacity <= 0.001) return null

              return (
                <Box
                  key={i}
                  sx={{
                    position: 'absolute',
                    textAlign: 'center',
                    color: '#fff',
                    px: 4,
                    opacity,
                    transform: `translateY(${(1 - opacity) * 14}px)`,
                    willChange: 'opacity, transform',
                    pointerEvents: 'none',
                    maxWidth: 900
                  }}
                >
                  {block.lines.map((line, j) => (
                    <Typography
                      key={j}
                      sx={{
                        fontWeight: j === 0 ? 300 : 600,
                        fontSize: { xs: 28, sm: 38, md: 52 },
                        lineHeight: 1.12,
                        letterSpacing: '-0.02em',
                        textShadow: '0 2px 24px rgba(0,0,0,0.45)'
                      }}
                    >
                      {line}
                    </Typography>
                  ))}
                </Box>
              )
            })}

          {/* Video failed → give an explicit way in */}
          {videoFailed && !handoff && (
            <Box sx={{ position: 'absolute', bottom: 64, zIndex: 3 }}>
              <Button
                variant='contained'
                size='large'
                onClick={enterDashboard}
                sx={{ px: 5, py: 1.5, borderRadius: 2, textTransform: 'none', fontSize: 16 }}
              >
                Enter PARITY
              </Button>
            </Box>
          )}

          {/* Scroll hint (only near the top) */}
          {!handoff && progress < 0.04 && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 40,
                color: 'rgba(255,255,255,0.75)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                animation: 'parityBob 1.8s ease-in-out infinite',
                '@keyframes parityBob': {
                  '0%,100%': { transform: 'translateY(0)' },
                  '50%': { transform: 'translateY(6px)' }
                }
              }}
            >
              <Typography sx={{ fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Scroll</Typography>
              <Box sx={{ fontSize: 20, lineHeight: 1 }}>↓</Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>,
    document.body
  )
}

export default ScrollHero
