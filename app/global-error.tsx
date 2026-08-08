'use client';

export default function GlobalError({ error }: { error: Error }) {
  return (
    <html>
      <body>En alvorlig feil oppstod: {error.message}</body>
    </html>
  );
}
