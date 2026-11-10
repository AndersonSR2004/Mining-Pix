import { createClient } from '@supabase/supabase-js'

const projectUrl = import.meta.env.VITE_SUPABASE_URL || 'https://odlasosyewiiepvrvbnn.supabase.co'
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ES-OP3yDVo_40YNHpoyf-Q_ZvJWUC8s'

if (!projectUrl || !publishableKey) {
  throw new Error('A configuração pública do Supabase está ausente.')
}

// Publishable key is intended for browser use. Authorization is enforced by RLS.
// Never place a secret/service_role key in this file or any VITE_* variable.
export const supabase = createClient(projectUrl, publishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})
