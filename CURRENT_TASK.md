# TilbudsMaskinen — status

## Hva vi har bygget
Full demo-app for TilbudsMaskinen (Next.js App Router + TypeScript + Tailwind):
- **Sider**: landing (`/`), kalkulator (`/calc`), resultat (`/result`), historikk (`/historikk`), firmaoppsett (`/innstillinger`), innlogging (`/logg-inn` + `/logg-inn/sjekk-e-post`)
- **AI-kalkulasjon**: `/api/calc` mot OpenAI, med lokalt fallback-estimat (prisbibliotek per fagtype) hvis nøkkel mangler/feiler
- **PDF-eksport**: ekte PDF client-side via jsPDF, med firmalogo/navn som brevhode
- **Innlogging**: NextAuth (`EmailProvider`, magic-link) med en egen lokal Supabase-adapter (`lib/supabaseAuthAdapter.ts`) mot `public`-skjemaet — den offisielle `@next-auth/supabase-adapter` hardkoder `next_auth`-skjema, som krevde PostgREST-eksponering som viste seg upålitelig
- **Lagring**: firma og tilbud lagres i Supabase (`public.users/firma/tilbud/kunder`), API-ruter beskyttet med `getServerSession`
- **Ruteecbeskyttelse**: `middleware.ts` krever innlogging for `/calc`, `/historikk`, `/innstillinger`
- **UI-bibliotek**: `components/ui/{Button,Card,Section,Input,Select,Textarea,AppLayout}`, brukt konsekvent på alle sider
- **Feilsider**: `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` (norsk tekst)

## Åpne bugs / blokkere
1. **Git-commit blokkert** — `git config user.name`/`user.email` er ikke satt på denne maskinen. Jeg setter ikke git-config selv (verken globalt eller lokalt) — brukeren må kjøre `git config user.name "..."` og `git config user.email "..."` selv, deretter kan committen fullføres.
2. **SMTP-innlogging feiler fortsatt i praksis** — diagnostisert årsak: `.env.local` har `EMAIL_SERVER_USER=apikey`, men isolert autentiseringstest mot Resend bekrefter at `EMAIL_SERVER_USER=resend` er riktig brukernavn. Fiksen er **foreslått, men ikke skrevet** — venter på eksplisitt brukergodkjenning (diff ble vist med maskert passord).
3. **Diskplass kritisk lav** på C:-stasjonen (målt ned mot ~0,1–0,3 GB ledig i løpet av økten). Kan gi uforutsigbare feil ved videre `npm install`/build. Ikke ryddet opp ennå.

## Umiddelbar neste oppgave
1. Få eksplisitt godkjenning for å endre `EMAIL_SERVER_USER=apikey` → `EMAIL_SERVER_USER=resend` i `.env.local`.
2. Skrive endringen, restarte dev-serveren.
3. Kjøre en reell ende-til-ende-test av `/logg-inn` i nettleseren (sende magic-link, bekrefte SMTP-suksess).
4. Når git-identitet er satt av bruker: fullføre den ventende committen av arbeidstreet.
