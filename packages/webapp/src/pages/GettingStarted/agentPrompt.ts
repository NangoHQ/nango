import type { ApiKeyListItem } from '@/hooks/useApiKeys';

export const QUICKSTART_URL = 'https://nango.dev/docs/getting-started/quickstart.md';

const DEFAULT_API_KEY_NAME = 'Default - Full access';
const FULL_ACCESS_SCOPE = 'environment:*';

const CLOUD_API_URL = 'https://api.nango.dev';

/**
 * The quickstart sends requests to Nango Cloud, so a self-hosted or local instance passes its own API URL.
 */
export function getInstallPrompt({ apiKey, apiUrl }: { apiKey: string | null; apiUrl: string }): string {
    return [
        `Add Nango to my agent by following the steps here: ${QUICKSTART_URL}`,
        ...(apiUrl !== CLOUD_API_URL ? [`Nango API URL: ${apiUrl}`] : []),
        ...(apiKey ? [`Environment API Key: ${apiKey}`] : [])
    ].join('\n');
}

/**
 * The quickstart needs a key that can create integrations and agent sessions. A narrower key would fail
 * partway through, so without a full-access key the prompt leaves the key out and the agent asks for one.
 */
export function pickPromptApiKey(keys: ApiKeyListItem[]): ApiKeyListItem | null {
    const fullAccess = keys.filter((key) => key.scopes.includes(FULL_ACCESS_SCOPE));
    return fullAccess.find((key) => key.display_name === DEFAULT_API_KEY_NAME) ?? fullAccess[0] ?? null;
}
