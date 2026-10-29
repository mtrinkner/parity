'use client'

// Third-party Imports
import classnames from 'classnames'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'

// Util Imports
import { verticalLayoutClasses } from '@layouts/utils/layoutClasses'

const FooterContent = () => {
  // Hooks
  const { isBreakpointReached } = useVerticalNav()

  return (
    <div
      className={classnames(verticalLayoutClasses.footerContent, 'flex items-center justify-between flex-wrap gap-4')}
    >
      <p className='text-textSecondary'>
        {`© ${new Date().getFullYear()} PARITY · AI-Powered Multifamily Deal Screening`}
      </p>
      {!isBreakpointReached && (
        <p className='text-textSecondary'>Every number traceable to source.</p>
      )}
    </div>
  )
}

export default FooterContent
