import { errorToObject } from '@nangohq/utils';

import type { EndUser, MessageRow } from '@nangohq/types';

export function errorToDocument(error?: unknown): MessageRow['error'] {
    if (!error) {
        return;
    }

    const err = { name: 'Unknown Error', message: 'unknown error', ...errorToObject(error) };
    return {
        name: error instanceof Error ? error.constructor.name : err.name,
        message: err.message,
        type: 'type' in err ? (err.type as string) : undefined,
        payload: 'payload' in err ? err.payload : undefined
    };
}

export function endUserToMeta(endUser?: EndUser) {
    if (!endUser) {
        return;
    }
    return {
        user: { id: endUser.endUserId, displayName: endUser.displayName, email: endUser.email },
        org: endUser.organization ? { id: endUser.organization.organizationId, displayName: endUser.organization.displayName } : undefined
    };
}
