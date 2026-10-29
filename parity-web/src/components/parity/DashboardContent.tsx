'use client'

import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'

import { useDeal } from '@/lib/deal-store'
import DealIntake from '@/components/parity/DealIntake'
import PropertyHeader from '@/components/parity/PropertyHeader'
import DealScoreGauge from '@/components/parity/DealScoreGauge'
import SeverityChip from '@/components/parity/SeverityChip'
import ProvenanceTag from '@/components/parity/ProvenanceTag'
import { formatMetricValue, severityColor } from '@/lib/format'

const highlightKeys = ['purchasePrice', 'noiUnderwritten', 'capRateUnderwritten', 'leveredIrr', 'equityMultiple', 'pricePerUnit']

const DashboardContent = () => {
  const { deal } = useDeal()

  if (!deal) {
    return <DealIntake />
  }

  const topFlags = [...deal.flags].sort((a, b) => b.pointsLost - a.pointsLost).slice(0, 5)

  const highlights = highlightKeys
    .map(key => deal.metrics.find(m => m.key === key))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))

  return (
    <>
      <PropertyHeader deal={deal} />

      <Grid container spacing={6}>
        {/* Deal Score */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant='overline' color='text.secondary'>
                Deal Score
              </Typography>
              <DealScoreGauge score={deal.score} />
              <Chip
                label={deal.verdict}
                color={deal.score >= 75 ? 'success' : deal.score >= 50 ? 'warning' : 'error'}
                variant='tonal'
                sx={{ fontWeight: 700, mt: 2 }}
              />
              {deal.verdictNote && (
                <Typography variant='body2' color='text.secondary' sx={{ mt: 3 }}>
                  {deal.verdictNote}
                </Typography>
              )}
              {deal.dealRiskPosture && (
                <Typography variant='caption' color='text.disabled' sx={{ display: 'block', mt: 2 }}>
                  Risk Posture: {deal.dealRiskPosture}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Risk Engine summary */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title='Risk Engine' subheader='Top flags by severity' />
            <CardContent sx={{ pt: 0 }}>
              <List disablePadding>
                {topFlags.map((flag, idx) => (
                  <Box key={flag.ruleId}>
                    <ListItem disableGutters sx={{ alignItems: 'flex-start', py: 2 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                            <Typography variant='body2' sx={{ fontWeight: 600 }}>
                              {flag.rule}
                            </Typography>
                            <SeverityChip severity={flag.severity} />
                          </Box>
                        }
                        secondary={
                          <Typography variant='caption' color='text.secondary'>
                            −{flag.pointsLost} pts · {flag.category}
                          </Typography>
                        }
                      />
                    </ListItem>
                    {idx < topFlags.length - 1 && <Divider />}
                  </Box>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Underwriting highlights */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title='Underwriting Highlights' />
            <CardContent sx={{ pt: 0 }}>
              <List disablePadding>
                {highlights.map((m, idx) => (
                  <Box key={m.key}>
                    <ListItem disableGutters sx={{ py: 2 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <Typography variant='body2' color='text.secondary'>
                              {m.label}
                            </Typography>
                            <Typography variant='body1' sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                              {formatMetricValue(m.value, m.unit)}
                            </Typography>
                          </Box>
                        }
                        secondary={<ProvenanceTag provenance={m.provenance} />}
                      />
                    </ListItem>
                    {idx < highlights.length - 1 && <Divider />}
                  </Box>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Executive Summary */}
        <Grid item xs={12}>
          <Card>
            <CardHeader title='Executive Summary' />
            <CardContent sx={{ pt: 0 }}>
              <Grid container spacing={6}>
                <Grid item xs={12} md={6}>
                  <Typography variant='subtitle2' color='success.main' sx={{ mb: 2 }}>
                    Strengths
                  </Typography>
                  <List disablePadding>
                    {deal.passes.slice(0, 5).map(p => (
                      <ListItem key={p.ruleId} disableGutters sx={{ py: 1 }}>
                        <ListItemText
                          primary={p.rule}
                          secondary={p.evidence}
                          primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant='subtitle2' color='error.main' sx={{ mb: 2 }}>
                    Concerns
                  </Typography>
                  <List disablePadding>
                    {deal.topRisks.map((risk, i) => (
                      <ListItem key={i} disableGutters sx={{ py: 1 }}>
                        <ListItemText primary={risk} primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
              </Grid>
              <Divider sx={{ my: 4 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant='subtitle2'>Verdict:</Typography>
                <Chip label={deal.verdict} color={severityColor(deal.dealRiskPosture ?? '')} variant='tonal' size='small' />
                {deal.verdictNote && (
                  <Typography variant='body2' color='text.secondary'>
                    {deal.verdictNote}
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  )
}

export default DashboardContent
