'use client'

import { useState } from 'react'

import dynamic from 'next/dynamic'

import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import type { ApexOptions } from 'apexcharts'

import { useDeal } from '@/lib/deal-store'
import DealIntake from '@/components/parity/DealIntake'
import PropertyHeader from '@/components/parity/PropertyHeader'
import SeverityChip from '@/components/parity/SeverityChip'
import { severityHex } from '@/lib/format'
import type { Flag, Severity } from '@/lib/types'

const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

const severityOrder: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const FlagRow = ({ flag }: { flag: Flag }) => {
  const [open, setOpen] = useState(false)

  return (
    <Box sx={{ py: 3 }}>
      <Box
        onClick={() => setOpen(o => !o)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 3,
          cursor: 'pointer'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
          <SeverityChip severity={flag.severity} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant='body1' sx={{ fontWeight: 600 }} noWrap>
              {flag.rule}
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              {flag.ruleId} · {flag.category}
              {flag.omPage ? ` · OM ${flag.omPage}` : ''}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          {flag.pointsLost > 0 && (
            <Typography variant='body2' color='error.main' sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              −{flag.pointsLost} pts
            </Typography>
          )}
          <IconButton size='small'>
            <i className={open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} />
          </IconButton>
        </Box>
      </Box>
      <Collapse in={open}>
        <Box sx={{ pl: { xs: 0, sm: 10 }, pt: 3 }}>
          <Typography variant='subtitle2' sx={{ mb: 1 }}>
            Evidence
          </Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
            {flag.evidence}
          </Typography>
          {flag.whyItMatters && (
            <>
              <Typography variant='subtitle2' sx={{ mb: 1 }}>
                Why It Matters
              </Typography>
              <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
                {flag.whyItMatters}
              </Typography>
            </>
          )}
          {flag.financialImpact && (
            <>
              <Typography variant='subtitle2' sx={{ mb: 1 }}>
                Financial Impact
              </Typography>
              <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
                {flag.financialImpact}
              </Typography>
            </>
          )}
          {flag.recommendedNextAction && (
            <>
              <Typography variant='subtitle2' sx={{ mb: 1 }}>
                Recommended Next Action
              </Typography>
              <Typography variant='body2' color='text.secondary'>
                {flag.recommendedNextAction}
              </Typography>
            </>
          )}
          {flag.additionalDDRequired && (
            <Chip label='Additional DD Required' size='small' color='warning' variant='tonal' sx={{ mt: 3 }} />
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

const RiskEnginePage = () => {
  const { deal } = useDeal()

  if (!deal) return <DealIntake />

  const donutSeries = severityOrder.map(s => deal.flags.filter(f => f.severity === s).length)
  const donutColors = severityOrder.map(severityHex)

  const donutOptions: ApexOptions = {
    chart: { type: 'donut' },
    labels: severityOrder,
    colors: donutColors,
    legend: { position: 'bottom' },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          labels: {
            show: true,
            total: { show: true, label: 'Flags', formatter: () => String(deal.counts.flaggedTotal) }
          }
        }
      }
    }
  }

  const rankedFlags = [...deal.flags].sort((a, b) => b.pointsLost - a.pointsLost)

  const barOptions: ApexOptions = {
    chart: { type: 'bar', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, distributed: true, barHeight: '65%' } },
    colors: rankedFlags.map(f => severityHex(f.severity)),
    dataLabels: { enabled: false },
    xaxis: { categories: rankedFlags.map(f => f.rule), title: { text: 'Points Lost' } },
    legend: { show: false },
    grid: { padding: { left: 10 } }
  }

  const allFlags: Flag[] = [...deal.flags, ...deal.insufficientData, ...deal.passes]

  return (
    <>
      <PropertyHeader deal={deal} />

      <Grid container spacing={6}>
        <Grid item xs={12} md={5}>
          <Card>
            <CardHeader title='Severity Distribution' />
            <CardContent>
              <AppReactApexCharts type='donut' height={300} series={donutSeries} options={donutOptions} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={7}>
          <Card>
            <CardHeader title='Score Impact by Flag' subheader='Ranked by points lost' />
            <CardContent>
              <AppReactApexCharts
                type='bar'
                height={Math.max(300, rankedFlags.length * 34)}
                series={[{ name: 'Points Lost', data: rankedFlags.map(f => f.pointsLost) }]}
                options={barOptions}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardHeader
              title='All Flags'
              subheader={`${deal.counts.flaggedTotal} flagged · ${deal.counts.pass} passed · ${deal.counts.insufficientData} insufficient data`}
            />
            <CardContent sx={{ pt: 0 }}>
              {allFlags.map((flag, idx) => (
                <Box key={flag.ruleId}>
                  <FlagRow flag={flag} />
                  {idx < allFlags.length - 1 && <Divider />}
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  )
}

export default RiskEnginePage
