import { createClient } from '@supabase/supabase-js'
import type { Adapter, AdapterAccount, AdapterUser } from 'next-auth/adapters'

// Lokal kopi av @next-auth/supabase-adapter, mot public-skjemaet i stedet for
// next_auth. Den offisielle pakken hardkoder db.schema: "next_auth" i sin
// interne Supabase-klient (node_modules/@next-auth/supabase-adapter/dist/index.js)
// uten mulighet til å overstyre det utenfra. Det krever at next_auth
// eksponeres via PostgREST (Project Settings > API > Exposed schemas), noe
// som viste seg upålitelig å få til å slå igjennom i dette prosjektet.
// public er alltid eksponert som standard, så vi legger adapter-tabellene der.

function isDate(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    new Date(value).toString() !== 'Invalid Date' &&
    !isNaN(Date.parse(value))
  )
}

export function format<T>(obj: Record<string, any>): T {
  for (const [key, value] of Object.entries(obj)) {
    if (value === null) {
      delete obj[key]
    } else if (isDate(value)) {
      obj[key] = new Date(value)
    }
  }
  return obj as T
}

interface Options {
  url: string
  secret: string
}

export function PublicSchemaSupabaseAdapter({ url, secret }: Options): Adapter {
  const supabase = createClient(url, secret, {
    global: {
      headers: { 'X-Client-Info': 'tilbudsmaskinen-public-schema-adapter' },
    },
  })

  return {
    async createUser(user: Omit<AdapterUser, 'id'>) {
      const { data, error } = await supabase
        .from('users')
        .insert({ ...user, emailVerified: user.emailVerified?.toISOString() })
        .select()
        .single()
      if (error) throw error
      return format(data)
    },
    async getUser(id) {
      const { data, error } = await supabase.from('users').select().eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return null
      return format(data)
    },
    async getUserByEmail(email) {
      const { data, error } = await supabase.from('users').select().eq('email', email).maybeSingle()
      if (error) throw error
      if (!data) return null
      return format(data)
    },
    async getUserByAccount({ providerAccountId, provider }) {
      const { data, error } = await supabase
        .from('accounts')
        .select('users (*)')
        .match({ provider, providerAccountId })
        .maybeSingle()
      if (error) throw error
      if (!data?.users) return null
      return format(data.users)
    },
    async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, 'id'>) {
      const { data, error } = await supabase
        .from('users')
        .update({ ...user, emailVerified: user.emailVerified?.toISOString() })
        .eq('id', user.id)
        .select()
        .single()
      if (error) throw error
      return format(data)
    },
    async deleteUser(userId) {
      const { error } = await supabase.from('users').delete().eq('id', userId)
      if (error) throw error
    },
    async linkAccount(account: AdapterAccount) {
      const { error } = await supabase.from('accounts').insert(account)
      if (error) throw error
    },
    async unlinkAccount({ providerAccountId, provider }: Pick<AdapterAccount, 'provider' | 'providerAccountId'>) {
      const { error } = await supabase.from('accounts').delete().match({ provider, providerAccountId })
      if (error) throw error
    },
    async createSession({ sessionToken, userId, expires }) {
      const { data, error } = await supabase
        .from('sessions')
        .insert({ sessionToken, userId, expires: expires.toISOString() })
        .select()
        .single()
      if (error) throw error
      return format(data)
    },
    async getSessionAndUser(sessionToken) {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, users(*)')
        .eq('sessionToken', sessionToken)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const { users: user, ...session } = data as any
      return { user: format(user), session: format(session) }
    },
    async updateSession(session) {
      const { data, error } = await supabase
        .from('sessions')
        .update({ ...session, expires: session.expires?.toISOString() })
        .eq('sessionToken', session.sessionToken)
        .select()
        .single()
      if (error) throw error
      return format(data)
    },
    async deleteSession(sessionToken) {
      const { error } = await supabase.from('sessions').delete().eq('sessionToken', sessionToken)
      if (error) throw error
    },
    async createVerificationToken(token) {
      const { data, error } = await supabase
        .from('verification_tokens')
        .insert({ ...token, expires: token.expires.toISOString() })
        .select()
        .single()
      if (error) throw error
      const { id, ...verificationToken } = data
      return format(verificationToken)
    },
    async useVerificationToken({ identifier, token }) {
      const { data, error } = await supabase
        .from('verification_tokens')
        .delete()
        .match({ identifier, token })
        .select()
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const { id, ...verificationToken } = data
      return format(verificationToken)
    },
  }
}
