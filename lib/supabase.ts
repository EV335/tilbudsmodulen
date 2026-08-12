import { createClient } from '@supabase/supabase-js'
import { paakrevdEnv } from '@/lib/env'

// Server-only klient. Bruker service_role-nøkkelen, som omgår RLS —
// importer ALDRI denne filen fra klientkomponenter ('use client').
export const supabase = createClient(
  paakrevdEnv('SUPABASE_URL'),
  paakrevdEnv('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
