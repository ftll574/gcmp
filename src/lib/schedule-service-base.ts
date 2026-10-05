/** Resolve the optional date-service endpoint for the current deployment. */
export function defaultScheduleServiceBase(configuredBase: string | undefined, hostname: string): string | null {
  const configured = configuredBase?.trim();
  if (configured) return configured;
  // GitHub Pages hosts this app as static files and does not deploy /api.
  // Keep a deliberate build-time endpoint override available for deployments
  // that do provide the schedule gateway.
  const host = hostname.toLowerCase();
  if (host === 'github.io' || host.endsWith('.github.io')) return null;
  return '/api';
}
