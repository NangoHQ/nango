import { getRemoteFunctionNangoHost } from '@nangohq/sandbox';

import type { Request } from 'express';

export function getFunctionSandboxNangoHost(req: Request): string {
    const host = firstHeaderValue(req.get('x-forwarded-host')) || req.get('host');
    if (!host) {
        return getRemoteFunctionNangoHost();
    }

    const protocol = firstHeaderValue(req.get('x-forwarded-proto')) || req.protocol;
    return `${protocol}://${host}`;
}

function firstHeaderValue(value: string | undefined): string | undefined {
    return value
        ?.split(',')
        .map((part) => part.trim())
        .find(Boolean);
}
