export { default } from 'next-auth/middleware'

export const config = {
  matcher: ['/calc/:path*', '/historikk/:path*', '/innstillinger/:path*'],
}
