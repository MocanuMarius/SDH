/**
 * SlashMenuDialog — triggered when the user types `/` in the body
 * editor. The slash is stripped out of the body, and this small
 * centered dialog opens with a list of insertions the writer can
 * perform without leaving the flow.
 *
 * Each option fires an action prop; the parent decides what
 * actually happens (open decision dialog, insert a date string,
 * append a prediction stub, etc.). Keeps the menu content-agnostic
 * so the action vocabulary can grow.
 */

import { Box, Dialog, DialogContent, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material'
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined'
import EventOutlinedIcon from '@mui/icons-material/EventOutlined'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import BookmarksIcon from '@mui/icons-material/Bookmarks'
import LoginIcon from '@mui/icons-material/Login'
import LogoutIcon from '@mui/icons-material/Logout'

export interface SlashMenuDialogProps {
  open: boolean
  onClose: () => void
  onInsertDecision: () => void
  onInsertDate: () => void
  onFocusPrediction: () => void
  onFocusWatchlist: () => void
  onFocusEntryRules: () => void
  onFocusExitRules: () => void
}

export default function SlashMenuDialog({
  open,
  onClose,
  onInsertDecision,
  onInsertDate,
  onFocusPrediction,
  onFocusWatchlist,
  onFocusEntryRules,
  onFocusExitRules,
}: SlashMenuDialogProps) {
  // Quote-block insertion was removed on the user's request — the
  // principle of "plain text only in the body" ruled out baking in
  // a markdown-like `> ` convention. Decisions stay in as an @-mention
  // because they're structured rows stored separately, not inline
  // text, which doesn't violate the principle.
  const items: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }[] = [
    { icon: <ArticleOutlinedIcon fontSize="small" />, label: 'Attach a decision', hint: 'Buy / Sell / Pass for this entry', onClick: onInsertDecision },
    { icon: <EventOutlinedIcon fontSize="small" />, label: 'Insert today\'s date', hint: 'e.g. "Sunday, Apr 20"', onClick: onInsertDate },
    { icon: <QueryStatsIcon fontSize="small" />, label: 'Add a prediction', hint: 'Probability + by-date bet', onClick: onFocusPrediction },
    { icon: <BookmarksIcon fontSize="small" />, label: 'Add a watchlist entry', hint: 'Ticker + alert target', onClick: onFocusWatchlist },
    { icon: <LoginIcon fontSize="small" />, label: 'Set entry rules', hint: 'Conditions that trigger a buy', onClick: onFocusEntryRules },
    { icon: <LogoutIcon fontSize="small" />, label: 'Set exit rules', hint: 'Conditions that trigger a sell', onClick: onFocusExitRules },
  ]
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px dashed', borderColor: 'divider' }}>
          <Typography
            variant="overline"
            sx={{ letterSpacing: '0.1em', fontWeight: 700, color: 'text.disabled', fontSize: '0.68rem' }}
          >
            Insert
          </Typography>
        </Box>
        <List dense disablePadding>
          {items.map((it) => (
            <ListItemButton
              key={it.label}
              onClick={() => { it.onClick(); onClose() }}
              sx={{ py: 1, px: 2, gap: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 32, color: 'primary.main' }}>{it.icon}</ListItemIcon>
              <ListItemText
                primary={it.label}
                secondary={it.hint}
                primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: 600 }}
                secondaryTypographyProps={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'text.disabled' }}
              />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  )
}
