'use client'

import { useEffect, useState } from 'react'

import Box from '@mui/material/Box'
import useMediaQuery from '@mui/material/useMediaQuery'

import DashboardContent from '@/components/parity/DashboardContent'

const DashboardPage = () => {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    // Next paint, so the entrance transition actually runs.
    const id = requestAnimationFrame(() => setEntered(true))

    return () => cancelAnimationFrame(id)
  }, [])

  const animate = !prefersReducedMotion
  const active = entered || !animate

  return (
    <Box
      sx={{
        opacity: active ? 1 : 0,
        transform: active ? 'scale(1)' : 'scale(1.01)',
        transition: animate ? 'opacity 600ms ease-out, transform 600ms ease-out' : 'none'
      }}
    >
      <DashboardContent />
    </Box>
  )
}

export default DashboardPage
