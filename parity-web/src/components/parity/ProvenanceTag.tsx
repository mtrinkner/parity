import Typography from '@mui/material/Typography'

import type { Provenance } from '@/lib/types'

const ProvenanceTag = ({ provenance }: { provenance: Provenance }) => {
  return (
    <Typography
      variant='caption'
      sx={{
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'text.disabled',
        fontSize: '0.65rem'
      }}
    >
      {provenance}
    </Typography>
  )
}

export default ProvenanceTag
