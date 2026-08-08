'use client';

export default function Error({ error }: { error: Error }) {
  return <div>Noe gikk galt: {error.message}</div>;
}
