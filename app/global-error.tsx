'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="no">
      <body style={{ backgroundColor: '#1a1a1c', color: '#fff', margin: 0 }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '24px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1rem' }}>En alvorlig feil oppstod</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '2rem', maxWidth: '28rem' }}>
            TilbudsMaskinen klarte ikke å laste siden. Prøv igjen, eller last siden på nytt.
          </p>
          <button
            onClick={reset}
            style={{
              backgroundColor: '#1d4ed8',
              color: '#fff',
              fontWeight: 700,
              padding: '0.75rem 2rem',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Prøv igjen
          </button>
        </div>
      </body>
    </html>
  )
}
