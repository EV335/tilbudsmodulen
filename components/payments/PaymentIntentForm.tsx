import React, { useState } from 'react';

export default function PaymentIntentForm({ tilbudId, amount }: { tilbudId: string; amount: number }) {
  const [email, setEmail] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const handleCreate = async () => {
    const res = await fetch('/api/payments/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tilbudId, amount, customerEmail: email })
    });
    const data = await res.json();
    setClientSecret(data.client_secret);
    // Client side: use Stripe.js to confirm card payment (om implementert)
  };

  return (
    <div>
      <label>Firma e‑post</label>
      <input value={email} onChange={e => setEmail(e.target.value)} className="input" />
      <button className="btn" onClick={handleCreate}>Opprett betaling</button>
      {clientSecret && <div>Client secret mottatt. Fullfør betaling i klient.</div>}
    </div>
  );
}

