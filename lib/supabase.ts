import { createClient } from '@supabase/supabase-js'

// Server-only klient. Bruker service_role-nøkkelen, som omgår RLS —
// importer ALDRI denne filen fra klientkomponenter ('use client').
export const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
