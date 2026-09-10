import { globalEnv } from '@/utils/env';

import type { GetOAuthInteraction, PostOAuthApprove, PostOAuthDeny, PostOAuthHandoff } from '@nangohq/types';

export class OAuthError extends Error {
    constructor(readonly code: string) {
        super('oauth_request_failed');
    }
}

async function request<T>(url: URL, body?: unknown): Promise<T> {
    const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        credentials: 'include',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    });
    if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new OAuthError(typeof json?.error?.code === 'string' ? json.error.code : 'server_error');
    }
    return await response.json();
}

function issuer(): string {
    if (!globalEnv.oauthServerUrl) throw new OAuthError('feature_disabled');
    return globalEnv.oauthServerUrl;
}

export async function readInteraction(uid: string): Promise<GetOAuthInteraction['Success']> {
    return await request(new URL(`/oauth/interaction/${encodeURIComponent(uid)}/details`, issuer()));
}

export async function decideInteraction(uid: string, csrfToken: string, approve: boolean): Promise<PostOAuthApprove['Success'] | PostOAuthDeny['Success']> {
    const body: PostOAuthApprove['Body'] = { csrfToken };
    return await request(new URL(`/oauth/interaction/${encodeURIComponent(uid)}/${approve ? 'approve' : 'deny'}`, issuer()), body);
}

export async function issueHandoff(state: string): Promise<PostOAuthHandoff['Success']> {
    const body: PostOAuthHandoff['Body'] = { state };
    return await request(new URL('/api/v1/oauth/handoff', globalEnv.dashboardApiUrl), body);
}

export function followOAuthRedirect(url: string, handoff = false): void {
    const target = new URL(url);
    const isIssuer = target.origin === new URL(issuer()).origin;
    const valid = handoff
        ? (isIssuer && target.pathname === '/oauth/handoff/callback') ||
          (target.origin === window.location.origin && ['/onboarding/account-discovery', '/onboarding/hear-about-us'].includes(target.pathname))
        : isIssuer && /^\/oauth\/authorize\/[A-Za-z0-9_-]+$/.test(target.pathname);
    if (!valid) throw new OAuthError('invalid_interaction');
    window.location.assign(target.href);
}

/** Only the opaque OAuth continuation may be carried through onboarding. */
export function oauthContinuation(search: string): string | undefined {
    const next = new URLSearchParams(search).get('next');
    return next && /^\/oauth\/continue\?state=[A-Za-z0-9_-]{20,128}$/.test(next) ? next : undefined;
}
