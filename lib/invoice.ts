import { createClient } from '@supabase/supabase-js';
import jsPDF from 'jspdf';
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

export async function generateInvoicePdf(invoiceData: {
  invoiceNumber: string;
  firma?: any;
  kunde?: any;
  lines: { description: string; qty: number; unit: number; total: number }[];
  total: number;
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  // Header: logo + firma info
  try {
    if (invoiceData.firma?.logo_path) {
      const { data: imgData, error } = await supabase.storage.from('assets').download(invoiceData.firma.logo_path);
      if (!error && imgData) {
        const blob = await imgData.arrayBuffer();
        const base64 = Buffer.from(blob).toString('base64');
        doc.addImage(`data:image/png;base64,${base64}`, 'PNG', 40, 30, 140, 60);
      }
    }
  } catch (err) {
    console.warn('Logo load failed', err);
  }
  doc.setFontSize(12);
  doc.text(invoiceData.firma?.name || 'Firma', 200, 40);
  doc.text(`Faktura: ${invoiceData.invoiceNumber}`, 400, 40);
  // Lines
  let y = 120;
  invoiceData.lines.forEach(line => {
    doc.text(line.description, 40, y);
    doc.text(String(line.qty), 300, y);
    doc.text(String(line.unit), 360, y);
    doc.text(String(line.total), 460, y);
    y += 20;
    if (y > 720) { doc.addPage(); y = 40; }
  });
  doc.text(`Total: ${invoiceData.total}`, 400, y + 20);
  return doc.output('arraybuffer');
}

export async function uploadInvoicePdf(buffer: ArrayBuffer, path: string) {
  const { data, error } = await supabase.storage.from('invoices').upload(path, Buffer.from(buffer), { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  const { publicURL } = supabase.storage.from('invoices').getPublicUrl(path);
  return publicURL;
}

