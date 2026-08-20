export type EnvRecord = Record<string, string | undefined>;

export function isInternalAuthRequired(env: EnvRecord = process.env): boolean {
    return env['NANGO_INTERNAL_AUTH_REQUIRED']?.toLowerCase() === 'true';
}

export function getInternalServiceCredential(env: EnvRecord = process.env): string | null {
    const token = env['NANGO_INTERNAL_AUTH_TOKEN']?.trim();
    return token || null;
}

export function getInternalAuthSigningKey(env: EnvRecord = process.env): string | null {
    const key = env['NANGO_INTERNAL_AUTH_SIGNING_KEY']?.trim();
    return key || null;
}

export function getInternalAuthRegisterToken(env: EnvRecord = process.env): string | null {
    const token = env['NANGO_INTERNAL_AUTH_REGISTER_TOKEN']?.trim();
    return token || null;
}

export function getInternalAuthIdleToken(env: EnvRecord = process.env): string | null {
    const token = env['NANGO_INTERNAL_AUTH_IDLE_TOKEN']?.trim();
    return token || null;
}

export function getInternalAuthBearerHeader(token: string | null | undefined): Record<string, string> {
    if (!token) {
        return {};
    }
    return { Authorization: `Bearer ${token}` };
}
