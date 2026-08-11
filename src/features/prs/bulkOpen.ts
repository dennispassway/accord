/** Boven de 5 tabs vragen we eerst bevestiging voor je ze allemaal opent. */
export function shouldConfirmBulkOpen(count: number): boolean {
  return count > 5;
}
