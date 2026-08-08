import React, { useEffect, useState } from 'react';

export default function InvoiceView({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<any>(null);
  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (res.ok) setInvoice(await res.json());
    })();
  }, [invoiceId]);

  if (!invoice) return <div>Laster faktura...</div>;
  return (
    <div className="p-6">
      <h1>Faktura {invoice.invoice_number}</h1>
      {invoice.pdf_url ? (
        <iframe src={invoice.pdf_url} className="w-full h-[800px]" />
      ) : (
        <div>PDF ikke tilgjengelig</div>
      )}
      <div className="mt-4">
        <a className="btn" href={invoice.pdf_url} download>Last ned PDF</a>
      </div>
    </div>
  );
}

