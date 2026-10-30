export function requestErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown } | null)?.data
  if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
    return data.message
  return fallback
}
