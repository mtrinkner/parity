'use client'

import { useRef, useState } from 'react'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Stack from '@mui/material/Stack'
import Alert from '@mui/material/Alert'
import LinearProgress from '@mui/material/LinearProgress'
import Divider from '@mui/material/Divider'
import Box from '@mui/material/Box'

import { useDeal } from '@/lib/deal-store'

const DealIntake = () => {
  const { loading, error, loadSample, uploadOm } = useDeal()
  const [dealName, setDealName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    if (!file || !dealName.trim()) return
    uploadOm(file, dealName.trim())
  }

  return (
    <Card>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 12 }}>
        <Typography variant='h4' sx={{ mb: 1 }}>
          Screen a Deal
        </Typography>
        <Typography variant='body1' color='text.secondary' sx={{ mb: 8, maxWidth: 480 }}>
          Upload an Offering Memorandum to run PARITY&apos;s automated deal-screening analysis, or load a sample deal
          to preview the dashboard.
        </Typography>

        {loading && (
          <Box sx={{ width: '100%', maxWidth: 420, mb: 6 }}>
            <Typography variant='body2' sx={{ mb: 2 }}>
              Reading the OM and running the risk engine — this typically takes 20-40 seconds for a 50+ page
              document.
            </Typography>
            <LinearProgress />
          </Box>
        )}

        {error && (
          <Alert severity='error' sx={{ width: '100%', maxWidth: 420, mb: 6, textAlign: 'left' }}>
            {error}
          </Alert>
        )}

        {!loading && (
          <Stack spacing={4} sx={{ width: '100%', maxWidth: 420 }}>
            <TextField
              label='Deal Name'
              placeholder='e.g. Example Tower'
              value={dealName}
              onChange={e => setDealName(e.target.value)}
              fullWidth
            />
            <Button variant='outlined' component='label' fullWidth>
              {file ? file.name : 'Choose OM PDF'}
              <input
                ref={fileInputRef}
                type='file'
                accept='application/pdf'
                hidden
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </Button>
            <Button variant='contained' size='large' disabled={!file || !dealName.trim()} onClick={handleSubmit}>
              Upload &amp; Screen Deal
            </Button>

            <Divider>or</Divider>

            <Button variant='outlined' color='secondary' size='large' onClick={loadSample}>
              Load Sample Deal
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

export default DealIntake
