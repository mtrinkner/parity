// MUI Imports
import { useTheme } from '@mui/material/styles'

// Third-party Imports
import PerfectScrollbar from 'react-perfect-scrollbar'

// Type Imports
import type { VerticalMenuContextProps } from '@menu/components/vertical-menu/Menu'

// Component Imports
import { Menu, MenuItem, MenuSection } from '@menu/vertical-menu'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'

// Styled Component Imports
import StyledVerticalNavExpandIcon from '@menu/styles/vertical/StyledVerticalNavExpandIcon'

// Style Imports
import menuItemStyles from '@core/styles/vertical/menuItemStyles'
import menuSectionStyles from '@core/styles/vertical/menuSectionStyles'

type RenderExpandIconProps = {
  open?: boolean
  transitionDuration?: VerticalMenuContextProps['transitionDuration']
}

const RenderExpandIcon = ({ open, transitionDuration }: RenderExpandIconProps) => (
  <StyledVerticalNavExpandIcon open={open} transitionDuration={transitionDuration}>
    <i className='ri-arrow-right-s-line' />
  </StyledVerticalNavExpandIcon>
)

const VerticalMenu = ({ scrollMenu }: { scrollMenu: (container: any, isPerfectScrollbar: boolean) => void }) => {
  // Hooks
  const theme = useTheme()
  const { isBreakpointReached, transitionDuration } = useVerticalNav()

  const ScrollWrapper = isBreakpointReached ? 'div' : PerfectScrollbar

  return (
    // eslint-disable-next-line lines-around-comment
    /* Custom scrollbar instead of browser scroll, remove if you want browser scroll only */
    <ScrollWrapper
      {...(isBreakpointReached
        ? {
            className: 'bs-full overflow-y-auto overflow-x-hidden',
            onScroll: container => scrollMenu(container, false)
          }
        : {
            options: { wheelPropagation: false, suppressScrollX: true },
            onScrollY: container => scrollMenu(container, true)
          })}
    >
      {/* Vertical Menu */}
      <Menu
        menuItemStyles={menuItemStyles(theme)}
        renderExpandIcon={({ open }) => <RenderExpandIcon open={open} transitionDuration={transitionDuration} />}
        renderExpandedMenuItemIcon={{ icon: <i className='ri-circle-line' /> }}
        menuSectionStyles={menuSectionStyles(theme)}
      >
        <MenuSection label='Deal Screening'>
          <MenuItem href='/dashboard' icon={<i className='ri-dashboard-line' />}>
            Dashboard
          </MenuItem>
          <MenuItem href='/risk-engine' icon={<i className='ri-alarm-warning-line' />}>
            Risk Engine
          </MenuItem>
          <MenuItem href='/underwriting' icon={<i className='ri-calculator-line' />}>
            Underwriting
          </MenuItem>
        </MenuSection>
        <MenuSection label='More'>
          <MenuItem href='/executive-summary' icon={<i className='ri-file-text-line' />}>
            Executive Summary
          </MenuItem>
          <MenuItem href='/market-analysis' icon={<i className='ri-bar-chart-2-line' />}>
            Market Analysis
          </MenuItem>
          <MenuItem href='/reports' icon={<i className='ri-file-chart-line' />}>
            Reports
          </MenuItem>
          <MenuItem href='/documents' icon={<i className='ri-folder-line' />}>
            Documents
          </MenuItem>
          <MenuItem href='/ai-analyst' icon={<i className='ri-robot-line' />}>
            AI Analyst
          </MenuItem>
          <MenuItem href='/settings' icon={<i className='ri-settings-4-line' />}>
            Settings
          </MenuItem>
        </MenuSection>
      </Menu>
    </ScrollWrapper>
  )
}

export default VerticalMenu
