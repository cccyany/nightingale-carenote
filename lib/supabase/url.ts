export function normalizeSupabaseUrl(value: string): string {
  return new URL(value).origin;
}
