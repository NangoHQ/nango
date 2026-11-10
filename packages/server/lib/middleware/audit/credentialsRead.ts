import { makeAuditTarget as makeTarget } from '../../audit.js';

import type { RequestLocals } from '../../utils/express.js';
import type { AuditOutcome, AuditTargetType } from '@nangohq/audit';
import type { Request } from 'express';

type AnyRequest = Request<any, any, any, any>;

/** Recorded when the handler reported returning credentials, or when an explicit request for them was denied. */
export function skipUnlessCredentialsRead(requested?: (req: AnyRequest) => boolean) {
    return (req: AnyRequest, _locals: Partial<RequestLocals>, outcome: AuditOutcome): boolean =>
        !req.audit?.credentialsRead && !(requested?.(req) && outcome === 'denied');
}

export function callerSubject(_req: AnyRequest, locals: Partial<RequestLocals>) {
    return locals.account ? { account: locals.account, environment: locals.environment } : undefined;
}

/** The targets the handler reported. A denial ran no handler, so it falls back to what the request names. */
export function credentialsReadTargets(type: AuditTargetType, req: AnyRequest, fromRequest?: unknown) {
    const reported = req.audit?.credentialsRead?.targets;
    return {
        target: reported ? reported.flatMap((target) => makeTarget(type, target.id, target.display) ?? []) : makeTarget(type, fromRequest),
        metadata: undefined
    };
}
