'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'

import type { DealResponse } from '@/lib/types'
import { useDeal } from '@/lib/deal-store'

const PropertyHeader = ({ deal }: { deal: DealResponse }) => {
  const { clearDeal } = useDeal()
  const units = deal.metrics.find(m => m.key === 'units')?.value

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 4,
        mb: 6
      }}
    >
      <Box>
        <Stack direction='row' spacing={2} alignItems='center' sx={{ mb: 1 }}>
          <Typography variant='h4'>{deal.property.name}</Typography>
          {units != null && <Chip label={`${units} units`} size='small' variant='tonal' color='primary' />}
        </Stack>
        <Typography variant='body1' color='text.secondary'>
          {deal.property.address}
        </Typography>
        {(deal.property.submarket || deal.property.broker) && (
          <Typography variant='body2' color='text.disabled'>
            {[deal.property.submarket, deal.property.broker].filter(Boolean).join(' · ')}
          </Typography>
        )}
      </Box>
      <Button variant='outlined' color='secondary' onClick={clearDeal}>
        Screen a New Deal
      </Button>
    </Box>
  )
}

export default PropertyHeader
