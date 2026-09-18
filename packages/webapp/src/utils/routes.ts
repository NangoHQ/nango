export const NON_ENV_PATH_PREFIXES = [
    '/onboarding/hear-about-us',
    '/onboarding/account-discovery',
    '/account-settings',
    '/team-settings',
    '/user-settings',
    '/team/billing',
    '/team/audit',
    '/api-keys'
];

// Raising this past the server's MAX_RETURN_TO_LENGTH sends destinations it silently resolves to `/`.
export const MAX_NEXT_LENGTH = 1024;

export const signinPathWithNext = (location: { pathname: string; search: string; hash: string }, options?: { expired?: boolean }): string => {
    const destination = location.pathname + location.search + location.hash;
    const params: string[] = [];

    if (destination !== '/' && destination.length <= MAX_NEXT_LENGTH) {
        params.push(`next=${encodeURIComponent(destination)}`);
    }
    if (options?.expired) {
        params.push('error=session_expired');
    }

    return params.length > 0 ? `/signin?${params.join('&')}` : '/signin';
};

const AUTH_PATH_PREFIXES = ['/signin', '/signup', '/forgot-password', '/reset-password', '/verify-email'];

export const isAuthPath = (pathname: string): boolean => {
    return AUTH_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
};

export const isNonEnvPath = (pathname: string): boolean => {
    // Direct non-env path: /team-settings, /team/billing, etc.
    if (NON_ENV_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
        return true;
    }
    // Legacy env-prefixed path: /:env/team-settings, /:env/team/billing, etc.
    const withoutEnvSegment = pathname.replace(/^\/[^/]+/, '');
    return NON_ENV_PATH_PREFIXES.some((p) => withoutEnvSegment === p || withoutEnvSegment.startsWith(p + '/'));
};
