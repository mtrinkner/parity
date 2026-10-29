// Type Imports
import type { ChildrenType } from '@core/types'

// Component Imports
import Providers from '@components/Providers'

// Minimal chrome-free layout: no sidebar, no navbar, no footer.
const LandingLayout = ({ children }: ChildrenType) => {
  const direction = 'ltr'

  return <Providers direction={direction}>{children}</Providers>
}

export default LandingLayout
