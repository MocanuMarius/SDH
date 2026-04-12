/**
 * Mobile nav drawer: all main links + sign out.
 * Used when hamburger is clicked on small screens.
 */

import { Drawer, List, ListItemButton, ListItemIcon, ListItemText, Box, Divider } from '@mui/material'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import NotificationsIcon from '@mui/icons-material/Notifications'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import TouchAppIcon from '@mui/icons-material/TouchApp'
import CancelIcon from '@mui/icons-material/Cancel'
import InsightsIcon from '@mui/icons-material/Insights'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import TimelineIcon from '@mui/icons-material/Timeline'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import SettingsIcon from '@mui/icons-material/Settings'
import LogoutIcon from '@mui/icons-material/Logout'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import EventNoteIcon from '@mui/icons-material/EventNote'
import SchoolIcon from '@mui/icons-material/School'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import { Badge } from '@mui/material'

const NAV_ITEMS = [
  { to: '/', label: 'Journal', icon: MenuBookIcon },
  { to: '/ideas', label: 'Ideas', icon: LightbulbIcon },
  { to: '/actions', label: 'Actions', icon: TouchAppIcon },
  { to: '/passed', label: 'Passed', icon: CancelIcon },
  { to: '/insights', label: 'Insights', icon: InsightsIcon },
  { to: '/analytics', label: 'Analytics', icon: AnalyticsIcon },
  { to: '/calibration', label: 'Calibration', icon: TrendingUpIcon },
  { to: '/skill-engineering', label: 'Deliberate Practice', icon: SchoolIcon },
  { to: '/decisions', label: 'Decisions', icon: EventNoteIcon },
  { to: '/timeline', label: 'Timeline', icon: TimelineIcon },
  { to: '/import', label: 'Import', icon: FileDownloadIcon },
  { to: '/broker-import', label: 'Broker Import', icon: UploadFileIcon },
  { to: '/watchlist', label: 'Watchlist', icon: NotificationsActiveIcon },
  { to: '/ibkr', label: 'IBKR', icon: AccountBalanceIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

interface NavDrawerProps {
  open: boolean
  onClose: () => void
  activityCount?: number
  onActivityClick?: () => void
  onSignOut: () => void
}

export default function NavDrawer({
  open,
  onClose,
  activityCount = 0,
  onActivityClick,
  onSignOut,
}: NavDrawerProps) {
  const location = useLocation()

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 280,
          maxWidth: '85vw',
          pt: 2,
          pb: 2,
        },
      }}
    >
      <List dense disablePadding>
        {onActivityClick != null && (
          <>
            <ListItemButton
              onClick={() => {
                onActivityClick()
                onClose()
              }}
              sx={{ py: 1.5 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <Badge badgeContent={activityCount} color="secondary">
                  <NotificationsIcon />
                </Badge>
              </ListItemIcon>
              <ListItemText primary="Activity" />
            </ListItemButton>
            <Divider sx={{ my: 1 }} />
          </>
        )}
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <ListItemButton
            key={to}
            component={RouterLink}
            to={to}
            onClick={onClose}
            selected={location.pathname === to || (to !== '/' && location.pathname.startsWith(to))}
            sx={{ py: 1.5 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Icon />
            </ListItemIcon>
            <ListItemText primary={label} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ flex: 1 }} />
      <Divider />
      <List dense disablePadding>
        <ListItemButton onClick={() => { onSignOut(); onClose() }} sx={{ py: 1.5 }}>
          <ListItemIcon sx={{ minWidth: 40 }}>
            <LogoutIcon />
          </ListItemIcon>
          <ListItemText primary="Sign out" />
        </ListItemButton>
      </List>
    </Drawer>
  )
}
