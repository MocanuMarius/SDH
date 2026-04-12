import { Box, Tab, Tabs, Paper, Typography, FormControl, InputLabel, Select, MenuItem, useMediaQuery } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useState } from 'react'
import PerSubSkillBrier from '../components/skill-engineering/PerSubSkillBrier'
import SessionFocusCard from '../components/SessionFocusCard'
import ErrorTaxonomy from '../components/skill-engineering/ErrorTaxonomy'
import BaseRateDatabase from '../components/skill-engineering/BaseRateDatabase'
import CaseLibrary from '../components/skill-engineering/CaseLibrary'
import ErrorBoundary from '../components/ErrorBoundary'

// Tab order — "Per Sub-Skill Brier" is now tab 0 (the old "Calibration & Brier Score"
// component was a never-finished scaffold that used a random placeholder for outcomes
// and queried a nonexistent user_id column; deleted in favour of this working version).
const TAB_LABELS = [
  'Per Sub-Skill Brier',
  'Error Taxonomy',
  'Base Rate Database',
  'Case Library',
]

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`skill-tabpanel-${index}`}
      aria-labelledby={`skill-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  )
}

export default function SkillEngineeringDashboard() {
  const [tabValue, setTabValue] = useState(0)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
        Practice
      </Typography>

      {/* Session training focus — moved here from Journal page */}
      <SessionFocusCard />


      {isMobile ? (
        <FormControl size="small" fullWidth sx={{ mb: 2 }}>
          <InputLabel>Section</InputLabel>
          <Select
            value={tabValue}
            label="Section"
            onChange={(e) => setTabValue(Number(e.target.value))}
          >
            {TAB_LABELS.map((label, i) => (
              <MenuItem key={label} value={i}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : (
        <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="skill engineering tabs"
            variant="scrollable"
            scrollButtons="auto"
          >
            {TAB_LABELS.map((label, i) => (
              <Tab
                key={label}
                label={label}
                id={`skill-tab-${i}`}
                aria-controls={`skill-tabpanel-${i}`}
              />
            ))}
          </Tabs>
        </Paper>
      )}

      <TabPanel value={tabValue} index={0}>
        <ErrorBoundary fallbackLabel="Per sub-skill Brier failed to render.">
          <PerSubSkillBrier />
        </ErrorBoundary>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <ErrorBoundary fallbackLabel="Error taxonomy failed to render.">
          <ErrorTaxonomy />
        </ErrorBoundary>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <ErrorBoundary fallbackLabel="Base rate database failed to render.">
          <BaseRateDatabase />
        </ErrorBoundary>
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <ErrorBoundary fallbackLabel="Case library failed to render.">
          <CaseLibrary />
        </ErrorBoundary>
      </TabPanel>
    </Box>
  )
}
