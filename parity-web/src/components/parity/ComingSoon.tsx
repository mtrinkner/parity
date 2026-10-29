import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'

const ComingSoon = ({ title }: { title: string }) => (
  <Card>
    <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 16 }}>
      <i className='ri-tools-line' style={{ fontSize: '2.5rem', opacity: 0.4, marginBottom: 16 }} />
      <Typography variant='h5' sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Chip label='Coming Soon' color='secondary' variant='tonal' />
      <Typography variant='body2' color='text.secondary' sx={{ mt: 4, maxWidth: 420 }}>
        This section is out of scope for the current hackathon build. It will be wired up in a future iteration.
      </Typography>
    </CardContent>
  </Card>
)

export default ComingSoon
