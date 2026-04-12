import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Alert,
  CircularProgress,
} from '@mui/material'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { signInWithPassword, loading, user } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true })
  }, [loading, user, navigate])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setBusy(true)
    const { error } = await signInWithPassword(email, password)
    setBusy(false)
    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }
    navigate('/')
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box
      sx={{
        maxWidth: 400,
        mx: 'auto',
        mt: { xs: 3, sm: 6 },
        p: { xs: 1.5, sm: 2 },
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Typography variant="h4" fontWeight={700} gutterBottom textAlign="center">
        Deecide
      </Typography>
      <Typography color="text.secondary" textAlign="center" sx={{ mb: 2 }}>
        Sign in with your account
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {message && (
          <Alert severity={message.type} sx={{ mb: 2 }}>
            {message.text}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSignIn}>
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            sx={{ mb: 2 }}
            autoComplete="email"
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            sx={{ mb: 2 }}
            autoComplete="current-password"
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={busy}
            sx={{ mt: 1 }}
          >
            {busy ? <CircularProgress size={24} /> : 'Sign in'}
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
