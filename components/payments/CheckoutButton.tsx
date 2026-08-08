import React from 'react';

export default function CheckoutButton({ tilbudId, amount }: { tilbudId: string; amount: number }) {
  const handleClick = async () => {
    const res = await fetch('/api/payments/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tilbudId, amount })
    });
    const data = await res.json();
    if (data?.url) window.location.href = data.url;
    else alert('Kunne ikke starte betaling');
  };
  return <button className="btn-primary" onClick={handleClick}>Betal nå</button>;
}

