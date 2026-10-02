import withAuth from 'next-auth/middleware'
import { harTilgang, tilgangFraEnv } from '@/lib/tilgang'

export default withAuth({
  pages: {
    signIn: '/logg-inn',
  },
  callbacks: {
    // Standardsjekken er kun «finnes det et token». Et utstedt token lever i
    // 30 dager, så uten sjekken under ville en bruker som fjernes fra
    // ALLOWED_EMAILS beholdt tilgangen til det gikk ut av seg selv.
    authorized: ({ token }) => !!token && harTilgang(token.email, tilgangFraEnv()),
  },
})

export const config = {
  matcher: [
    '/oversikt/:path*',
    '/calc/:path*',
    '/historikk/:path*',
    '/innstillinger/:path*',
    '/kunder/:path*',
  ],
}
