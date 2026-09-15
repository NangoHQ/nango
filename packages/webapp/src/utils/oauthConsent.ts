const consentPath = /^\/oauth\/consent\/[A-Za-z0-9_-]+\/review$/;

export function getOAuthConsentDestination(value: string | null): string | undefined {
    return value && consentPath.test(value) ? value : undefined;
}

export function withOAuthConsentDestination(path: string, destination: string | undefined): string {
    return destination ? `${path}?next=${encodeURIComponent(destination)}` : path;
}
