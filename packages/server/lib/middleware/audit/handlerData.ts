import { getLogger, metrics } from '@nangohq/utils';

import type { RequestLocals } from '../../utils/express.js';
import type { AuditAction, AuditResource, AuthOperationType, InternalEndUser } from '@nangohq/types';
import type { Response } from 'express';

const logger = getLogger('Audit');

// What only the handler can know: an id the caller never sent, which of two actions happened, whether a
// login was actually established.
export interface AuditHandlerData {
    connectionUpsert?: {
        operation: AuthOperationType;
        connectionId: string;
        providerConfigKey: string;
        account: { id: number; uuid: string };
        environment: { id: number; name: string };
        endUser?: InternalEndUser | null | undefined;
    };
    authSucceeded?: true;
    authPendingMfa?: { userId: number };
    managedSignup?: boolean;
}

export type AuditHandlerDataKey = keyof AuditHandlerData;

export function setAuditHandlerData(res: Response<any, Partial<RequestLocals>>, data: AuditHandlerData): void {
    res.locals.auditHandlerData = data;
}

/**
 * A denial runs no handler, so absent data is only wrong on success — a check that ignored the outcome
 * would fire on every 403 and be muted within a week.
 */
export function reportMissingHandlerData(
    data: AuditHandlerData | undefined,
    expected: readonly AuditHandlerDataKey[],
    on: { resource: AuditResource; action: AuditAction; succeeded: boolean }
): void {
    if (!on.succeeded || expected.length === 0 || expected.some((key) => data?.[key] !== undefined)) {
        return;
    }
    logger.warning(`the handler returned no audit data, expected ${expected.join(' or ')}`, { resource: on.resource, action: on.action });
    metrics.increment(metrics.Types.AUDIT_HANDLER_DATA_MISSING, 1, { resource: on.resource, action: on.action });
}
