export const NON_ENV_PATH_PREFIXES = ['/onboarding/hear-about-us', '/account-settings', '/team-settings', '/user-settings', '/team/billing', '/team/audit'];

export const isNonEnvPath = (pathname: string): boolean => {
    // Direct non-env path: /team-settings, /team/billing, etc.
    if (NON_ENV_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
        return true;
    }
    // Legacy env-prefixed path: /:env/team-settings, /:env/team/billing, etc.
    const withoutEnvSegment = pathname.replace(/^\/[^/]+/, '');
    return NON_ENV_PATH_PREFIXES.some((p) => withoutEnvSegment === p || withoutEnvSegment.startsWith(p + '/'));
};
