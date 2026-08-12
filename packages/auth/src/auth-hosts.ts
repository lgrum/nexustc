export const AUTH_ALLOWED_HOSTS = ["nexustc18.com", "*.nexustc18.com"] as const;

export function isAuthHostnameAllowed(hostname: string, fallbackUrl: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === new URL(fallbackUrl).hostname.toLowerCase()) {
    return true;
  }
  return AUTH_ALLOWED_HOSTS.some((allowed) =>
    allowed.startsWith("*.")
      ? normalized.endsWith(allowed.slice(1))
      : normalized === allowed
  );
}
