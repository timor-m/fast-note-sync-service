export function fnsConfig() {
  const runtime = useRuntimeConfig()
  return {
    fnsApiBaseUrl: process.env.FNS_API_BASE_URL || runtime.fnsApiBaseUrl,
    sessionPassword:
      process.env.FNS_SESSION_PASSWORD || runtime.sessionPassword,
    sessionSecure:
      process.env.FNS_SESSION_SECURE === undefined
        ? runtime.sessionSecure
        : process.env.FNS_SESSION_SECURE !== 'false',
  }
}
