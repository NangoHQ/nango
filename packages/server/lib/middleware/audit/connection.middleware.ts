import { changedFields, makeAuditTarget as makeTarget } from '../../audit.js';
import { connectionCreatedActor } from '../../hooks/auditConnection.js';
import { Audit, auditable, maybeAuditable, resolveActor } from './auditable.js';
import { bodyField, nonEmptyString, omitUndefined, param, query } from './input.js';

import type {
    AuditPolicy,
    DeleteConnection,
    DeletePublicConnection,
    Endpoint,
    PatchConnection,
    PatchPublicConnection,
    PostConnectionMetadata,
    PostConnectionRefresh
} from '@nangohq/types';

/**
 * `connection.created` for every route that upserts a connection. One middleware rather than fifteen
 * near-identical ones, because the handler reports what happened on the request and nothing here is
 * endpoint-specific. The trade-off is that the policy is pinned to this shape instead of being checked
 * against each route's declared `Audit`, which a shared middleware cannot do.
 *
 * A re-authorization is skipped: it upserts through the same endpoints and answers the same 200.
 * `connection.reauthorized` exists in the vocabulary if we ever want it, and it belongs here.
 */
export const auditConnectionCreated = maybeAuditable<Endpoint<any> & { Audit: AuditPolicy<'connection', 'created', 'environment'> }>({
    policy: Audit.auditable({ resource: 'connection', action: 'created', scope: 'environment' }),
    skipWhen: (req) => req.audit?.connectionUpsert?.operation === 'override',
    subject: (req, locals) => {
        const upsert = req.audit?.connectionUpsert;
        if (upsert) {
            return { account: upsert.account, environment: upsert.environment };
        }
        // Nothing was created, so this is a denial or a failure, and the account comes from the request
        // instead. An attempt on an unauthenticated route has neither, and one nobody can be attributed to
        // is not worth a row.
        return locals.account ? { account: locals.account, environment: locals.environment } : undefined;
    },
    // The request wins when it proves who called; only the handler can name who started an OAuth callback.
    actor: (req, locals) => connectionCreatedActor(resolveActor(locals), req.audit?.connectionUpsert?.endUser, req.audit?.connectionUpsert?.authType),
    atFinish: (req) => {
        const upsert = req.audit?.connectionUpsert;
        const connectionId = upsert?.connectionId ?? nonEmptyString(query(req, 'connection_id')) ?? nonEmptyString(bodyField(req, 'connection_id'));
        const providerConfigKey =
            upsert?.providerConfigKey ?? nonEmptyString(param(req, 'providerConfigKey')) ?? nonEmptyString(bodyField(req, 'provider_config_key'));
        return {
            target: makeTarget('connection', connectionId),
            metadata: providerConfigKeyMeta(providerConfigKey)
        };
    }
});

export const auditConnectionUpdated = auditable<PatchConnection>({
    policy: Audit.auditable({ resource: 'connection', action: 'updated', scope: 'environment' }),
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => connectionUpdatedMeta(req.query.provider_config_key, changedFields(req.body))
});

export const auditPublicConnectionUpdated = auditable<PatchPublicConnection>({
    policy: Audit.auditable({ resource: 'connection', action: 'updated', scope: 'environment' }),
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => connectionUpdatedMeta(req.query.provider_config_key, changedFields(req.body))
});

export const auditConnectionMetadataUpdated = auditable<PostConnectionMetadata>({
    policy: Audit.auditable({ resource: 'connection', action: 'metadata_updated', scope: 'environment' }),
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => providerConfigKeyMeta(req.query.provider_config_key)
});

export const auditConnectionRefreshed = auditable<PostConnectionRefresh>({
    policy: Audit.auditable({ resource: 'connection', action: 'refreshed', scope: 'environment' }),
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => providerConfigKeyMeta(req.query.provider_config_key)
});

export const auditConnectionDeleted = auditable<DeleteConnection>({
    policy: Audit.auditable({ resource: 'connection', action: 'deleted', scope: 'environment' }),
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => providerConfigKeyMeta(req.query.provider_config_key)
});

export const auditPublicConnectionDeleted = auditable<DeletePublicConnection>({
    policy: Audit.auditable({ resource: 'connection', action: 'deleted', scope: 'environment' }),
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => providerConfigKeyMeta(req.query.provider_config_key)
});

function providerConfigKeyMeta(value: unknown): Record<string, unknown> | undefined {
    return omitUndefined({ providerConfigKey: nonEmptyString(value) });
}

function connectionUpdatedMeta(providerConfigKey: unknown, fields: string[] | undefined): Record<string, unknown> | undefined {
    return omitUndefined({
        providerConfigKey: nonEmptyString(providerConfigKey),
        changedFields: fields
    });
}
