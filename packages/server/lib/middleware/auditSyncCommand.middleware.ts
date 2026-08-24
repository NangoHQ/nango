import { connectionService, SyncCommand } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import { audit } from '../audit.js';
import { canRecordAuditTrail } from '../utils/auditTrail.js';
import { contextFromRequest, outcomeFromStatus, resolveActor, syncScopeMeta, syncTargetId } from './audit.middleware.js';

import type { RequestLocals } from '../utils/express.js';
import type { AuditEvent, AuditTarget, SyncTriggeredMetadata } from '@nangohq/audit';
import type { Request, RequestHandler, Response } from 'express';

const logger = getLogger('Audit');

// `/sync/command` is a legacy untyped controller that multiplexes several actions via `req.body.command`,
// so it has no endpoint type for the typed `auditable()` middleware to bind to. This purpose-built
// middleware reads the command from the body and maps it to an audit action.

type SyncCommandAudit = { action: 'paused' | 'started' | 'cancelled' } | { action: 'triggered'; metadata: SyncTriggeredMetadata };

function bodyString(body: Record<string, unknown>, key: string): string | undefined {
    const value = body[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isSyncCommand(value: unknown): value is SyncCommand {
    return typeof value === 'string' && (Object.values(SyncCommand) as string[]).includes(value);
}

function mapCommand(body: Record<string, unknown>): SyncCommandAudit | undefined {
    const command = body['command'];
    if (!isSyncCommand(command)) {
        return undefined;
    }
    switch (command) {
        case SyncCommand.PAUSE:
            return { action: 'paused' };
        case SyncCommand.UNPAUSE:
            return { action: 'started' };
        case SyncCommand.RUN:
            return { action: 'triggered', metadata: { full: false, deleteRecords: false } };
        case SyncCommand.RUN_FULL:
            return { action: 'triggered', metadata: { full: true, deleteRecords: body['delete_records'] === true } };
        case SyncCommand.CANCEL:
            return { action: 'cancelled' };
        default: {
            const _exhaustive: never = command;
            return _exhaustive;
        }
    }
}

function syncTarget(body: Record<string, unknown>): AuditTarget | undefined {
    const syncName = bodyString(body, 'sync_name');
    if (!syncName) {
        return undefined;
    }
    return { type: 'sync', id: syncTargetId(syncName, bodyString(body, 'sync_variant')) };
}

/**
 * This route names the connection by its internal id while the public sync routes use the one the customer
 * knows. Resolving it here is what lets a dashboard row and an API row carry the same two fields.
 */
async function syncCommandScope(body: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
    const nangoConnectionId = body['nango_connection_id'];
    if (typeof nangoConnectionId !== 'number') {
        return undefined;
    }
    const connection = await connectionService.getConnectionById(nangoConnectionId);
    return syncScopeMeta(connection?.provider_config_key, connection?.connection_id);
}

export const auditSyncCommand: RequestHandler = (req, res, next) => {
    res.on('finish', () => {
        void emit(req, res);
    });
    next();
};

async function emit(req: Request, res: Response): Promise<void> {
    const occurredAt = new Date().toISOString();
    try {
        const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
        const mapped = mapCommand(body);
        if (!mapped) {
            return;
        }
        const locals = res.locals as RequestLocals;
        const { account, environment } = locals;
        if (!account || !(await canRecordAuditTrail(account.uuid, locals.plan))) {
            return;
        }
        const target = syncTarget(body);
        const metadata = { ...(await syncCommandScope(body)), ...('metadata' in mapped ? mapped.metadata : {}) };
        const event = {
            occurredAt,
            accountId: account.id,
            environment: environment ? { id: environment.id, display: environment.name } : null,
            actor: resolveActor(locals),
            resource: 'sync',
            action: mapped.action,
            targets: target ? [target] : [],
            context: contextFromRequest(req),
            outcome: outcomeFromStatus(res.statusCode),
            ...(Object.keys(metadata).length > 0 ? { metadata } : {})
        } as AuditEvent;
        const result = await audit.record(event);
        if (result.isErr()) {
            logger.error(`failed to record audit event`, result.error);
        }
    } catch (err) {
        logger.error(`failed to emit audit event`, err);
    }
}
