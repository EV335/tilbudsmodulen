'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

export interface Firma {
  firmanavn: string
  logo_url?: string | null
}

interface FirmaTilstand {
  firma: Firma | null
  laster: boolean
}

// Firmaopplysningene trengs både i headeren (navn/logo) og på resultatsiden
// (avsender i PDF-en). Før dette hentet begge sin egen kopi, så /result fyrte
// av to identiske /api/firma-kall ved hver visning.
const FirmaContext = createContext<FirmaTilstand>({ firma: null, laster: true })

export function useFirma(): Firma | null {
  return useContext(FirmaContext).firma
}

// Skiller "har ikke firma" fra "vet ikke ennå". Uten det skillet ville
// oppsett-varselet blinket til på hver eneste sidelast mens kallet pågikk.
export function useManglerFirma(): boolean {
  const { firma, laster } = useContext(FirmaContext)
  return !laster && !firma?.firmanavn
}

export default function FirmaProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  const [tilstand, setTilstand] = useState<FirmaTilstand>({ firma: null, laster: true })

  useEffect(() => {
    if (status === 'loading') return
    if (status !== 'authenticated') {
      setTilstand({ firma: null, laster: false })
      return
    }

    let aktiv = true
    setTilstand((t) => ({ ...t, laster: true }))
    fetch('/api/firma')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (aktiv) setTilstand({ firma: data, laster: false })
      })
      .catch(() => {
        if (aktiv) setTilstand({ firma: null, laster: false })
      })
    return () => {
      aktiv = false
    }
  }, [status])

  return <FirmaContext.Provider value={tilstand}>{children}</FirmaContext.Provider>
}
