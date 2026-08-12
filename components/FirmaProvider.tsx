'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

export interface Firma {
  firmanavn: string
  logo_url?: string | null
}

// Firmaopplysningene trengs både i headeren (navn/logo) og på resultatsiden
// (avsender i PDF-en). Før dette hentet begge sin egen kopi, så /result fyrte
// av to identiske /api/firma-kall ved hver visning.
const FirmaContext = createContext<Firma | null>(null)

export function useFirma(): Firma | null {
  return useContext(FirmaContext)
}

export default function FirmaProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  const [firma, setFirma] = useState<Firma | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') {
      setFirma(null)
      return
    }

    let aktiv = true
    fetch('/api/firma')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (aktiv) setFirma(data)
      })
      .catch(() => {
        if (aktiv) setFirma(null)
      })
    return () => {
      aktiv = false
    }
  }, [status])

  return <FirmaContext.Provider value={firma}>{children}</FirmaContext.Provider>
}
