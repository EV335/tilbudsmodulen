# apply-and-test.ps1
# Kjør fra repo-rot. Forutsetter at tilbudsmoduler.patch finnes i repo-rot.

$patchFile = "tilbudsmoduler.patch"
if (-not (Test-Path $patchFile)) {
  Write-Error "Patchfil ikke funnet: $patchFile. Lim inn patch-innholdet i denne filen først."
  exit 1
}

Write-Host "1) Sjekker git status..."
git status --porcelain
if ($LASTEXITCODE -ne 0) { Write-Error "Dette ser ikke ut som en git-repo. Gå til repo-rot."; exit 1 }

Write-Host "2) Apply patch..."
git apply $patchFile
if ($LASTEXITCODE -ne 0) { Write-Error "git apply feilet. Sjekk patchfilen."; exit 1 }

Write-Host "3) Legger til og committer endringer..."
git add -A
git commit -m "feat(payments+invoices+firma-ui): add Stripe payments, invoices, firma logo and business/private UI"
if ($LASTEXITCODE -ne 0) { Write-Warning "Ingen endringer å committe eller commit feilet."; }

Write-Host "4) Forsøker å pushe til origin HEAD..."
git push -u origin HEAD
if ($LASTEXITCODE -ne 0) { Write-Warning "Push feilet. Sjekk remote/credentials."; }

Write-Host "5) Husk å kjøre migrasjoner i Supabase SQL Editor med fil: migrations/20260808_create_payments_invoices_customers.sql"
Write-Host "6) Sett env-vars i .env.local som dokumentert i docs/payments-setup.md"

Write-Host "7) Starter dev-server i nytt vindu (Ctrl+C i det vinduet stopper serveren)."
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c npm run dev" 

Write-Host "8) Åpne nytt terminalvindu og kjør Stripe CLI:"
Write-Host "   stripe listen --forward-to localhost:3000/api/webhooks/stripe"
Write-Host "Ferdig. Følg docs/payments-setup.md for videre testing."
