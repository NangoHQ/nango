import { createRouteFetch } from '@nangohq/utils';

import { getInternalAuthBearerHeader, getInternalServiceCredential } from './credential.js';

import type { Endpoint } from '@nangohq/types';
import type { Route } from '@nangohq/utils';

/** Control-plane calls (OrchestratorClient). Attaches the internal Bearer when one is configured. */
export const internalRouteFetch = <E extends Endpoint<any>>(
    baseUrl: string,
    route: Route<E>,
    config?: {
        timeoutMs?: number | undefined;
    }
) => {
    return createRouteFetch(baseUrl, route, {
        ...config,
        headers: getInternalAuthBearerHeader(getInternalServiceCredential())
    });
};
