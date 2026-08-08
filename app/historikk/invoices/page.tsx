import React, { useEffect, useState } from 'react';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/invoices');
      if (res.ok) {
        const data = await res.json();
        setInvoices(data);
      }
    })();
  }, []);

  return (
    <div className="p-6">
      <h1>Fakturaoversikt</h1>
      <div className="grid gap-4">
        {invoices.map(inv => (
          <div key={inv.id} className="card">
            <div className="flex justify-between">
              <div>{inv.invoice_number}</div>
              <div>{inv.status}</div>
            </div>
            <div className="mt-2">
              <a href={`/invoices/${inv.id}`}>Vis</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

