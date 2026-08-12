import { NextAuthOptions } from 'next-auth'
import EmailProvider from 'next-auth/providers/email'
import { PublicSchemaSupabaseAdapter } from '@/lib/supabaseAuthAdapter'
import { paakrevdEnv } from '@/lib/env'

export const authOptions: NextAuthOptions = {
  adapter: PublicSchemaSupabaseAdapter({
    url: paakrevdEnv('SUPABASE_URL'),
    secret: paakrevdEnv('SUPABASE_SERVICE_ROLE_KEY'),
  }),
  providers: [
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/logg-inn',
    verifyRequest: '/logg-inn/sjekk-e-post',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}
