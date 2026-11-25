import { APIError } from '@/utils/api';

// Must match how packages/cli/lib/utils.ts reads the key, which keeps hyphens.
export function secretKeyEnvVar(env: string): string {
    return `NANGO_SECRET_KEY_${env.toUpperCase()}`;
}

export const ENV_NAME_PATTERN = /^[a-z0-9_-]+$/;

export function sameRecord(a: Record<string, string>, b: Record<string, string>): boolean {
    const aKeys = Object.keys(a);
    return aKeys.length === Object.keys(b).length && aKeys.every((key) => key in b && a[key] === b[key]);
}

export function settingsPath(env: string, ...segments: (string | number)[]): string {
    return ['', env, 'environment-settings', ...segments].join('/');
}

export function apiErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof APIError) {
        const message = (err.json as { error?: { message?: string } }).error?.message;
        if (message) return message;
    }
    return fallback;
}
