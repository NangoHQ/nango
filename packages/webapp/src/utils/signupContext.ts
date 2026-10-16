/** Only report public auth routes, never invitation/verification tokens or query strings. */
export function readSignupPath(pathname = window.location.pathname): '/signup' | '/signin' | undefined {
    if (pathname === '/signup' || pathname === '/signup/') return '/signup';
    if (pathname === '/signin' || pathname === '/signin/') return '/signin';
    return undefined;
}
