import { NextAuthOptions } from 'next-auth'
import EmailProvider from 'next-auth/providers/email'
import { PublicSchemaSupabaseAdapter } from '@/lib/supabaseAuthAdapter'
import { paakrevdEnv } from '@/lib/env'
import { harTilgang, tilgangFraEnv } from '@/lib/tilgang'

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
    // Uten denne havner en avvist eller utløpt magic link på next-auth sin
    // egen /api/auth/error — ustylt, engelsk, og uten vei tilbake. Nå kommer
    // feilkoden tilbake til vårt eget skjema som ?error=.
    error: '/logg-inn',
  },
  callbacks: {
    // next-auth kaller signIn både når magic link-en bes om og når den
    // klikkes, så denne ene sjekken dekker hele løpet: en avvist adresse får
    // verken e-post eller sesjon.
    async signIn({ user }) {
      return harTilgang(user?.email, tilgangFraEnv())
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      // API-rutene ligger utenfor middleware-matcheren, og vokter i stedet på
      // session.user.id. Uten sjekken her ville en bruker som fjernes fra lista
      // blitt stengt ute av sidene, men fortsatt kunne kalt API-et med cookien
      // sin — og sendt fakturaer fra avsenderdomenet — helt til tokenet gikk ut
      // av seg selv.
      if (session.user && harTilgang(token.email, tilgangFraEnv())) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}
