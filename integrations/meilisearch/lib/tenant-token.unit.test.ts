import crypto from 'crypto';

import { describe, expect, it } from 'vitest';

import { generateTenantToken } from './tenant-token.js';

function decodeSegment(seg: string): unknown {
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

describe('generateTenantToken', () => {
    const apiKey = 'masterKeyExampleValue123';
    const apiKeyUid = '8dcbb482-cb02-4d4c-91a6-6b9c4f3e8d11';
    const searchRules = { medical_records: { filter: 'user_id = 1' } };

    it('produces a three-segment JWT with HS256 header', () => {
        const token = generateTenantToken({ apiKey, apiKeyUid, searchRules });
        const parts = token.split('.');
        expect(parts).toHaveLength(3);
        expect(decodeSegment(parts[0]!)).toEqual({ alg: 'HS256', typ: 'JWT' });
    });

    it('embeds searchRules and apiKeyUid in the payload', () => {
        const token = generateTenantToken({ apiKey, apiKeyUid, searchRules });
        const payload = decodeSegment(token.split('.')[1]!) as Record<string, unknown>;
        expect(payload['apiKeyUid']).toBe(apiKeyUid);
        expect(payload['searchRules']).toEqual(searchRules);
        expect(payload['exp']).toBeUndefined();
    });

    it('includes exp when expiresAt is provided', () => {
        const token = generateTenantToken({ apiKey, apiKeyUid, searchRules, expiresAt: 1893456000 });
        const payload = decodeSegment(token.split('.')[1]!) as Record<string, unknown>;
        expect(payload['exp']).toBe(1893456000);
    });

    it('signs the token so the HMAC verifies with the api key', () => {
        const token = generateTenantToken({ apiKey, apiKeyUid, searchRules });
        const [header, payload, signature] = token.split('.');
        const expected = crypto
            .createHmac('sha256', apiKey)
            .update(`${header}.${payload}`)
            .digest('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
        expect(signature).toBe(expected);
    });
});
