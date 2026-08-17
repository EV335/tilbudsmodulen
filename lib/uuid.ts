// Postgres svarer «invalid input syntax for type uuid» på en id som ikke har
// riktig form, og et oppslag som skulle gitt «fant ikke» ble dermed en 500 med
// databasefeilen i klartekst. Vakten hørte hjemme ett sted, ikke i hver rute
// som slår opp på en uuid-kolonne.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function erUuid(verdi: unknown): verdi is string {
  return typeof verdi === 'string' && UUID.test(verdi)
}
