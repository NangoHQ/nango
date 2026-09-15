const consentPath = /^\/oauth\/consent\/[^/?#]+\/review$/;

export function getOAuthConsentDestination(value: string | null): string | undefined {
    return value && consentPath.test(value) ? value : undefined;
}
