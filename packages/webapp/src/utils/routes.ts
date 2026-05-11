export const NON_ENV_PATH_PREFIXES = ['/onboarding/hear-about-us', '/team-settings', '/user-settings', '/team/billing'];

export const isNonEnvPath = (pathname: string): boolean => NON_ENV_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
