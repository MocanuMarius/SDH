import { Component, type ReactNode } from 'react'
import { Box, Typography, Button, Alert } from '@mui/material'

interface Props {
  children: ReactNode
  fallbackLabel?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error" sx={{ mb: 1 }}>
            <Typography variant="body2" fontWeight={600}>
              {this.props.fallbackLabel ?? 'Something went wrong in this section.'}
            </Typography>
            {this.state.error?.message && (
              <Typography variant="caption" display="block" sx={{ mt: 0.5, fontFamily: 'monospace' }}>
                {this.state.error.message}
              </Typography>
            )}
          </Alert>
          <Button size="small" variant="outlined" onClick={this.handleReset}>
            Try again
          </Button>
        </Box>
      )
    }
    return this.props.children
  }
}
