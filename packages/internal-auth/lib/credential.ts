export type InternalAuthEnvs = {
    NANGO_INTERNAL_AUTH_REQUIRED: boolean;
    NANGO_INTERNAL_AUTH_TOKEN?: string | undefined;
    NANGO_INTERNAL_AUTH_SIGNING_KEY?: string | undefined;
    NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY?: string | undefined;
};

export function trimOrNull(value: string | undefined): string | null {
    const token = value?.trim();
    return token || null;
}

export function getInternalAuthBearerHeaderIfPresent(token: string | null | undefined): Record<string, string> {
    if (!token) {
        return {};
    }
    return { Authorization: `Bearer ${token}` };
}
