// Third-party Imports
import 'react-perfect-scrollbar/dist/css/styles.css'

// Type Imports
import type { ChildrenType } from '@core/types'

// Style Imports
import '@/app/globals.css'

// Generated Icon CSS Imports
import '@assets/iconify-icons/generated-icons.css'

// Context Imports
import { DealProvider } from '@/lib/deal-store'

export const metadata = {
  title: 'PARITY — AI-Powered Multifamily Deal Screening',
  description:
    'PARITY screens multifamily Offering Memorandums — re-underwriting from trailing actuals and running a 20-rule risk engine, with every number traceable to source.'
}

const RootLayout = ({ children }: ChildrenType) => {
  // Vars
  const direction = 'ltr'

  return (
    <html id='__next' dir={direction}>
      <body className='flex is-full min-bs-full flex-auto flex-col'>
        {/* Hoisted to the root so the landing page and the dashboard share ONE deal store instance. */}
        <DealProvider>{children}</DealProvider>
      </body>
    </html>
  )
}

export default RootLayout
