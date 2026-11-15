/** db.execute returns an array (postgres-js) or { rows } (PGlite). */
export function allRows<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : (res as { rows: T[] }).rows) as T[];
}
