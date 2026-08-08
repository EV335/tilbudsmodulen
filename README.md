# TilbudsMaskinen

AI-drevet kalkulator og tilbudsgenerator for norske håndverkere.

## Ruter

**Offentlige ruter** (krever ikke innlogging):
- `/` — landingsside
- `/logg-inn` — innloggingsside (magic-link via e-post)
- `/logg-inn/sjekk-e-post` — bekreftelsesside etter utsendt magic-link

**Beskyttede ruter** (krever innlogging, håndheves av `middleware.ts`):
- `/calc` — **post-login-siden**, dit brukeren sendes etter vellykket innlogging
- `/historikk` — tidligere lagrede tilbud
- `/innstillinger` — firmaoppsett (navn, logo, org.nr, adresse)

`/result` er ikke rutebeskyttet av middleware (leser kun fra `sessionStorage`), men API-et den er avhengig av (`/api/tilbud`, `/api/calc`) krever gyldig sesjon server-side.

## Innlogging

Innloggingssiden ligger i [app/logg-inn/page.tsx](app/logg-inn/page.tsx) og bruker NextAuth sin `EmailProvider` (magic-link). Auth-konfigurasjonen ligger i [lib/auth.ts](lib/auth.ts), med en egen Supabase-adapter i [lib/supabaseAuthAdapter.ts](lib/supabaseAuthAdapter.ts) som lagrer brukere/sesjoner i `public`-skjemaet (se [supabase/schema.sql](supabase/schema.sql)).

## Backend og miljøvariabler

Backend-logikk, Supabase-adapteren og `.env.local` er **ikke endret** som del av frontend-arbeidet i dette repoet — kun UI, routing-beskyttelse og tekstinnhold.
