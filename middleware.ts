import withAuth from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/logg-inn',
  },
})

export const config = {
  matcher: ['/calc/:path*', '/historikk/:path*', '/innstillinger/:path*', '/kunder/:path*'],
}
