import crypto from 'crypto';

export interface SearchRules {
    [indexOrWildcard: string]: { filter?: string } | Record<string, unknown> | boolean | unknown[];
}

export interface TenantTokenParams {
    /** The Meilisearch API key value used to sign the token. */
    apiKey: string;
    /** The uid of the API key used to sign the token. */
    apiKeyUid: string;
    /** Per-index search rules (the ACL carried by the token). */
    searchRules: SearchRules;
    /** Optional expiry as epoch seconds. */
    expiresAt?: number;
}

function base64url(input: Buffer | string): string {
    return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Build a Meilisearch tenant token: an HS256 JWT signed with an API key value.
 * Pure function — no network, no SDK — so it is fully unit-testable.
 */
export function generateTenantToken({ apiKey, apiKeyUid, searchRules, expiresAt }: TenantTokenParams): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: Record<string, unknown> = { searchRules, apiKeyUid };
    if (expiresAt !== undefined) {
        payload['exp'] = expiresAt;
    }

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signature = base64url(crypto.createHmac('sha256', apiKey).update(`${encodedHeader}.${encodedPayload}`).digest());

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}
