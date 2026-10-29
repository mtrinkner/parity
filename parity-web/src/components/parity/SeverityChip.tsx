import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'

import type { Severity } from '@/lib/types'
import { severityColor } from '@/lib/format'

const severityLabel = (severity: Severity) => (severity === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT DATA' : severity)

const SeverityChip = ({ severity, size = 'small' }: { severity: Severity; size?: ChipProps['size'] }) => {
  return (
    <Chip
      label={severityLabel(severity)}
      color={severityColor(severity)}
      size={size}
      variant='tonal'
      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
    />
  )
}

export default SeverityChip
