import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_KEY!);

export default function FirmaPage() {
  const [firma, setFirma] = useState<any>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    // Hent firma for innlogget bruker (forenklet)
    (async () => {
      const res = await fetch('/api/firma/me');
      if (res.ok) {
        const data = await res.json();
        setFirma(data);
        setName(data?.name || '');
      }
    })();
  }, []);

  const save = async () => {
    const res = await fetch('/api/firma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (res.ok) alert('Lagret');
  };

  return (
    <div className="p-6">
      <h1>Firmaoppsett</h1>
      <label>Firmanavn</label>
      <input className="input" value={name} onChange={e => setName(e.target.value)} />
      <button className="btn" onClick={save}>Lagre</button>
    </div>
  );
}

