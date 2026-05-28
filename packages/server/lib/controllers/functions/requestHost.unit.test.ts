import { describe, expect, it } from 'vitest';

import { getFunctionSandboxNangoHost } from './requestHost.js';

import type { Request } from 'express';

function request(headers: Record<string, string | undefined>, protocol = 'http'): Request {
    return {
        protocol,
        get: (name: string) => headers[name.toLowerCase()]
    } as Request;
}

describe('getFunctionSandboxNangoHost', () => {
    it('uses forwarded host and protocol when present', () => {
        expect(
            getFunctionSandboxNangoHost(
                request({
                    'x-forwarded-host': 'api-development.nango.dev',
                    'x-forwarded-proto': 'https',
                    host: 'internal:3003'
                })
            )
        ).toBe('https://api-development.nango.dev');
    });

    it('uses the first forwarded value', () => {
        expect(
            getFunctionSandboxNangoHost(
                request({
                    'x-forwarded-host': 'api-development.nango.dev, internal:3003',
                    'x-forwarded-proto': 'https, http',
                    host: 'internal:3003'
                })
            )
        ).toBe('https://api-development.nango.dev');
    });

    it('falls back to the request host', () => {
        expect(getFunctionSandboxNangoHost(request({ host: 'localhost:3003' }, 'http'))).toBe('http://localhost:3003');
    });
});
