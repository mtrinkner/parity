'use client'

import dynamic from 'next/dynamic'

import type { ApexOptions } from 'apexcharts'

import { scoreColor } from '@/lib/format'

const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

const DealScoreGauge = ({ score }: { score: number }) => {
  const color = scoreColor(score)

  const options: ApexOptions = {
    chart: {
      type: 'radialBar',
      sparkline: { enabled: true }
    },
    colors: [color],
    plotOptions: {
      radialBar: {
        hollow: { size: '65%' },
        track: { background: 'var(--mui-palette-customColors-trackBg)' },
        dataLabels: {
          name: { show: false },
          value: {
            offsetY: 8,
            fontSize: '2.25rem',
            fontWeight: 700,
            color: 'var(--mui-palette-text-primary)',
            formatter: val => `${val}`
          }
        }
      }
    },
    stroke: { lineCap: 'round' },
    grid: { padding: { top: -10, bottom: -10 } }
  }

  return <AppReactApexCharts type='radialBar' width='100%' height={220} series={[score]} options={options} />
}

export default DealScoreGauge
