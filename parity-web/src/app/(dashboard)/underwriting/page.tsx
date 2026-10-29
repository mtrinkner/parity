'use client'

import dynamic from 'next/dynamic'

import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableContainer from '@mui/material/TableContainer'
import Box from '@mui/material/Box'
import type { ApexOptions } from 'apexcharts'

import { useDeal } from '@/lib/deal-store'
import DealIntake from '@/components/parity/DealIntake'
import PropertyHeader from '@/components/parity/PropertyHeader'
import ProvenanceTag from '@/components/parity/ProvenanceTag'
import { formatMetricValue } from '@/lib/format'
import type { Metric } from '@/lib/types'

const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

const groups: { title: string; keys: string[] }[] = [
  {
    title: 'Income',
    keys: ['noiT12', 'noiSeller', 'noiUnderwritten', 'occupancyPhysical', 'occupancyLeased', 'avgRentPerUnit']
  },
  {
    title: 'Valuation',
    keys: [
      'purchasePrice',
      'pricePerUnit',
      'pricePerSf',
      'capRateSeller',
      'capRateUnderwritten',
      'exitValue',
      'units'
    ]
  },
  {
    title: 'Debt',
    keys: ['loanAmount', 'ltv', 'dscrIO', 'dscrAmortizing', 'debtYield']
  },
  {
    title: 'Returns',
    keys: ['leveredIrr', 'unleveredIrr', 'equityMultiple']
  }
]

const MetricsTable = ({ metrics }: { metrics: Metric[] }) => (
  <TableContainer>
    <Table size='small'>
      <TableHead>
        <TableRow>
          <TableCell>Metric</TableCell>
          <TableCell align='right'>Value</TableCell>
          <TableCell>Source</TableCell>
          <TableCell>Notes</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {metrics.map(m => (
          <TableRow key={m.key}>
            <TableCell>{m.label}</TableCell>
            <TableCell align='right' sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              {formatMetricValue(m.value, m.unit)}
            </TableCell>
            <TableCell>
              <ProvenanceTag provenance={m.provenance} />
            </TableCell>
            <TableCell>
              <Typography variant='caption' color='text.secondary'>
                {m.note ?? ''}
              </Typography>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
)

const UnderwritingPage = () => {
  const { deal } = useDeal()

  if (!deal) return <DealIntake />

  const t12 = deal.metrics.find(m => m.key === 'noiT12')
  const seller = deal.metrics.find(m => m.key === 'noiSeller')
  const underwritten = deal.metrics.find(m => m.key === 'noiUnderwritten')

  const noiSeries = [t12?.value ?? null, seller?.value ?? null, underwritten?.value ?? null]

  const noiOptions: ApexOptions = {
    chart: { type: 'bar', toolbar: { show: false } },
    plotOptions: { bar: { columnWidth: '45%', distributed: true, borderRadius: 4 } },
    colors: ['var(--mui-palette-info-main)', 'var(--mui-palette-warning-main)', 'var(--mui-palette-primary-main)'],
    dataLabels: {
      enabled: true,
      formatter: val => (val == null ? 'N/A' : `$${Number(val).toLocaleString('en-US')}`)
    },
    xaxis: { categories: ['T-12 Actual', 'Seller Pro Forma', 'Re-underwritten'] },
    yaxis: { labels: { formatter: val => `$${(val / 1_000_000).toFixed(1)}M` } },
    legend: { show: false },
    tooltip: { y: { formatter: val => `$${Number(val).toLocaleString('en-US')}` } }
  }

  return (
    <>
      <PropertyHeader deal={deal} />

      <Grid container spacing={6}>
        <Grid item xs={12}>
          <Card>
            <CardHeader
              title='NOI: Broker Claim vs. Reality'
              subheader='Trailing-12 actual vs. seller pro forma vs. PARITY re-underwrite'
            />
            <CardContent>
              <Box sx={{ maxWidth: 700, mx: 'auto' }}>
                <AppReactApexCharts
                  type='bar'
                  height={360}
                  series={[{ name: 'NOI', data: noiSeries }]}
                  options={noiOptions}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {groups.map(group => {
          const groupMetrics = group.keys
            .map(key => deal.metrics.find(m => m.key === key))
            .filter((m): m is Metric => Boolean(m))

          if (groupMetrics.length === 0) return null

          return (
            <Grid item xs={12} md={6} key={group.title}>
              <Card>
                <CardHeader title={group.title} />
                <CardContent sx={{ pt: 0 }}>
                  <MetricsTable metrics={groupMetrics} />
                </CardContent>
              </Card>
            </Grid>
          )
        })}
      </Grid>
    </>
  )
}

export default UnderwritingPage
