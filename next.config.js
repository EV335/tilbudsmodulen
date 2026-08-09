/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `next build` og `next dev` skriver som standard til samme .next-katalog.
  // Kjører man et produksjonsbygg mens dev-serveren står på, blir katalogen
  // korrupt: statiske chunks 404-er og sider henger på "Laster..." uten at noe
  // feiler i loggen. Med denne kan man bygge ved siden av en kjørende dev:
  //   NEXT_DIST_DIR=.next-build npx next build
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

module.exports = nextConfig
