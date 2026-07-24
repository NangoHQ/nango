/**
 * Connection IDs are customer-chosen and can be emails or other personal data (PHI),
 * so they must not reach PostHog or Sentry (NAN-6428). Strips the connection id from
 * dashboard and API URLs before telemetry events leave the browser.
 *
 * URL shapes:
 * - API:       /api/v1/connections/:connectionId[/...]   (except count/admin)
 * - Dashboard: /:env/connections/:providerConfigKey/:connectionId[/...]   (except create pages)
 */
export function redactConnectionIdFromUrl(url: string): string {
    let redacted: string;
    if (url.includes('/api/v1/connections/')) {
        redacted = url.replace(/(\/api\/v1\/connections\/)(?!(?:count|admin)(?:[/?#]|$))[^/?#]+/, '$1__redacted__');
    } else {
        redacted = url.replace(/(\/connections\/(?!(?:create|create-legacy)(?:[/?#]|$))[^/?#]+\/)[^/?#]+/, '$1__redacted__');
    }
    return redacted.replace(/([?&](?:connection_id|connectionId)=)[^&#]*/g, '$1__redacted__');
}
