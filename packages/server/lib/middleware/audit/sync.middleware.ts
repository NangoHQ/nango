import { connectionService, SyncCommand } from '@nangohq/shared';

import { auditEventDropped, makeAuditTarget as makeTarget, recordAuditEvent } from '../../audit.js';
import { normalizeSyncParams, syncTargetId } from '../../controllers/sync/helpers.js';
import { canRecordAuditTrail } from '../../utils/auditTrail.js';
import { Audit, auditable, auditEnrichmentFailed, auditRequestFields, logger, outcomeFromStatus, resolveActor } from './auditable.js';
import { nonEmptyString, omitUndefined } from './input.js';

import type { SyncTriggerOptions } from '../../controllers/sync/helpers.js';
import type { RequestLocals } from '../../utils/express.js';
import type { AuditEvent, AuditTarget } from '@nangohq/audit';
import type {
    DeleteSyncVariant,
    PatchFlowDisable,
    PatchFlowEnable,
    PatchFlowFrequency,
    PostPublicSyncPause,
    PostPublicSyncStart,
    PostSyncVariant,
    PutPublicSyncConnectionFrequency
} from '@nangohq/types';
import type { Request, RequestHandler, Response } from 'express';

export const auditSyncEnabled = auditable<PatchFlowEnable>({
    policy: Audit.auditable({ resource: 'sync', action: 'enabled', scope: 'environment' }),
    target: (req) => makeTarget('sync', req.body.scriptName),
    metadata: (req) => syncBaseMeta(req.body.providerConfigKey)
});

export const auditSyncDisabled = auditable<PatchFlowDisable>({
    policy: Audit.auditable({ resource: 'sync', action: 'disabled', scope: 'environment' }),
    target: (req) => makeTarget('sync', req.body.scriptName),
    metadata: (req) => syncBaseMeta(req.body.providerConfigKey)
});

export const auditSyncPaused = auditable<PostPublicSyncPause>({
    policy: Audit.auditable({ resource: 'sync', action: 'paused', scope: 'environment' }),
    target: (req) => syncTargets(req.body?.syncs, req.body?.provider_config_key),
    metadata: (req) => syncBaseMeta(req.body.provider_config_key, req.body.connection_id)
});

export const auditSyncStarted = auditable<PostPublicSyncStart>({
    policy: Audit.auditable({ resource: 'sync', action: 'started', scope: 'environment' }),
    target: (req) => syncTargets(req.body?.syncs, req.body?.provider_config_key),
    metadata: (req) => syncBaseMeta(req.body.provider_config_key, req.body.connection_id)
});

export const auditSyncFrequencyChanged = auditable<PatchFlowFrequency>({
    policy: Audit.auditable({ resource: 'sync', action: 'frequency_changed', scope: 'environment' }),
    target: (req) => makeTarget('sync', req.body.scriptName),
    metadata: (req) => ({ ...syncBaseMeta(req.body.providerConfigKey), ...syncFrequencyMeta(req.body.frequency) })
});

export const auditPublicSyncFrequencyChanged = auditable<PutPublicSyncConnectionFrequency>({
    policy: Audit.auditable({ resource: 'sync', action: 'frequency_changed', scope: 'environment' }),
    target: (req) => makeTarget('sync', syncTargetId(req.body.sync_name, req.body.sync_variant)),
    metadata: (req) => ({
        ...syncBaseMeta(req.body.provider_config_key, req.body.connection_id),
        ...syncFrequencyMeta(req.body.frequency)
    })
});

export const auditSyncVariantCreated = auditable<PostSyncVariant>({
    policy: Audit.auditable({ resource: 'sync', action: 'variant_created', scope: 'environment' }),
    target: (req) => makeTarget('sync', syncTargetId(req.params.name, req.params.variant)),
    metadata: (req) => ({ variant: req.params.variant, ...syncBaseMeta(req.body.provider_config_key, req.body.connection_id) })
});

export const auditSyncVariantDeleted = auditable<DeleteSyncVariant>({
    policy: Audit.auditable({ resource: 'sync', action: 'variant_deleted', scope: 'environment' }),
    target: (req) => makeTarget('sync', syncTargetId(req.params.name, req.params.variant)),
    metadata: (req) => ({ variant: req.params.variant, ...syncBaseMeta(req.body.provider_config_key, req.body.connection_id) })
});

// `/sync/command` is a legacy untyped controller that multiplexes several actions via `req.body.command`,
// so it has no endpoint type for the typed `auditable()` middleware to bind to. This purpose-built
// middleware reads the command from the body and maps it to an audit action.
export const auditSyncCommand: RequestHandler = (req, res, next) => {
    res.on('finish', () => {
        void emit(req, res);
    });
    next();
};

function syncFrequencyMeta(frequency: unknown): Record<string, unknown> | undefined {
    return omitUndefined({ frequency: nonEmptyString(frequency) });
}

function syncBaseMeta(providerConfigKey: unknown, connectionId?: unknown): Record<string, unknown> | undefined {
    return omitUndefined({ providerConfigKey: nonEmptyString(providerConfigKey), connectionId: nonEmptyString(connectionId) });
}

/** An empty or absent `syncs` means every sync, expanded only after this has run, so the integration is the widest scope the request itself names. */
export function syncTargets(syncs: unknown, providerConfigKey: unknown): AuditTarget | AuditTarget[] | undefined {
    const targets = normalizeSyncParams(validSyncParams(syncs))
        .map(({ syncName, syncVariant }) => makeTarget('sync', syncTargetId(syncName, syncVariant)))
        .filter((t): t is AuditTarget => Boolean(t));
    return targets.length > 0 ? targets : makeTarget('integration', providerConfigKey);
}

type SyncParam = Parameters<typeof normalizeSyncParams>[0][number];

/** Members are unvalidated, and a non-string name would concatenate into the target id — drop those, keep the rest. */
function validSyncParams(syncs: unknown): SyncParam[] {
    if (!Array.isArray(syncs)) {
        return [];
    }
    return syncs.flatMap((sync): SyncParam[] => {
        if (typeof sync === 'string') {
            return [sync];
        }
        if (!sync || typeof sync !== 'object') {
            return [];
        }
        const { name, variant } = sync as Record<string, unknown>;
        const syncName = nonEmptyString(name);
        return syncName ? [{ name: syncName, variant: nonEmptyString(variant) ?? 'base' }] : [];
    });
}

type SyncCommandAudit = { action: 'paused' | 'started' | 'cancelled' } | { action: 'triggered'; metadata: SyncTriggerOptions };

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
            return { action: 'triggered', metadata: { reset: false, emptyCache: false } };
        case SyncCommand.RUN_FULL:
            return { action: 'triggered', metadata: { reset: true, emptyCache: body['delete_records'] === true } };
        case SyncCommand.CANCEL:
            return { action: 'cancelled' };
        default: {
            const _exhaustive: never = command;
            return _exhaustive;
        }
    }
}

function syncTarget(body: Record<string, unknown>): AuditTarget | undefined {
    const syncName = nonEmptyString(body['sync_name']);
    if (!syncName) {
        return undefined;
    }
    return { type: 'sync', id: syncTargetId(syncName, nonEmptyString(body['sync_variant'])) };
}

/** This route names the connection by its internal id; the public sync routes use the one the customer knows. */
async function syncCommandScope(body: Record<string, unknown>, environmentId: number | undefined): Promise<Record<string, unknown> | undefined> {
    const nangoConnectionId = body['nango_connection_id'];
    if (typeof nangoConnectionId !== 'number' || environmentId === undefined) {
        return undefined;
    }
    // Enrichment must not cost the event: the emit path would otherwise abort before recording it.
    try {
        const connection = await connectionService.getConnectionById(nangoConnectionId);
        // The id is the caller's to choose and this runs whatever the outcome, so an unscoped lookup would
        // write another tenant's integration and connection into this account's trail.
        if (connection?.environment_id !== environmentId) {
            return undefined;
        }
        return syncBaseMeta(connection.provider_config_key, connection.connection_id);
    } catch (err) {
        auditEnrichmentFailed('metadata', 'sync', err);
        return undefined;
    }
}

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
        const metadata = { ...(await syncCommandScope(body, environment?.id)), ...('metadata' in mapped ? mapped.metadata : {}) };
        const event = {
            occurredAt,
            accountId: account.id,
            scope: 'environment',
            environment: environment ? { id: environment.uuid, display: environment.name } : null,
            actor: resolveActor(locals),
            resource: 'sync',
            action: mapped.action,
            targets: target ? [target] : [],
            ...auditRequestFields(req, account.id),
            outcome: outcomeFromStatus(res.statusCode),
            ...(Object.keys(metadata).length > 0 ? { metadata } : {})
        } as AuditEvent;
        await recordAuditEvent(event);
    } catch (err) {
        logger.error(`failed to emit audit event`, err);
        auditEventDropped('sync', 'build_failed');
    }
}
