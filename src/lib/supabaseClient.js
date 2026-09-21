import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Only a public/publishable key belongs in a Vite browser application.
export const supabase = url && publishableKey ? createClient(url, publishableKey) : null
export const supabaseConfigError = supabase
  ? ''
  : 'Supabase is not configured. Showing the six-item menu from this app. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart Vite to load live products.'
