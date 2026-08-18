import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { accountService, customerKeyService, environmentService, getInvitation, getSyncConfigById, userService } from '@nangohq/shared';
import { getLogger, metrics } from '@nangohq/utils';

import { audit, changedFields, makeAuditTarget as makeTarget, toAuditId as toId } from '../audit.js';

import type { RequestLocals } from '../utils/express.js';
import type { AuditActor, AuditAttribution, AuditContext, AuditEvent, AuditOutcome, AuditTarget, AuditTargetType, MfaVerifiedMetadata } from '@nangohq/audit';
import type {
    AcceptInvite,
    AuditActionOf,
    AuditPolicy,
    AuditResource,
    AuditScope,
    CreateAccountApiKey,
    CreateApiKey,
    DeclineInvite,
    DeleteAccountApiKey,
    DeleteApiKey,
    DeleteConnection,
    DeleteEnvironment,
    DeleteIntegration,
    DeleteIntegrationFunction,
    DeleteInvite,
    DeleteMFA,
    DeletePublicApiKey,
    DeletePublicConnection,
    DeletePublicEnvironment,
    DeletePublicIntegration,
    DeletePublicIntegrationFunction,
    DeleteStripePayment,
    DeleteSyncVariant,
    DeleteTeamUser,
    Endpoint,
    PatchApiKey,
    PatchConnection,
    PatchEnvironment,
    PatchFlowDisable,
    PatchFlowEnable,
    PatchFlowFrequency,
    PatchIntegration,
    PatchPublicConnection,
    PatchPublicIntegration,
    PatchTeamUser,
    PatchUser,
    PatchWebhook,
    PostConnectionMetadata,
    PostConnectionRefresh,
    PostDeploy,
    PostEnvironment,
    PostEnvironmentVariables,
    PostFunctionDeployment,
    PostFunctionDeploymentBundle,
    PostIntegration,
    PostInvite,
    PostMFAActivation,
    PostMFAEnrollment,
    PostMFALoginVerification,
    PostMFARecoveryCodes,
    PostPlanChange,
    PostPlanExtendTrial,
    PostPreBuiltDeploy,
    PostPublicApiKey,
    PostPublicEnvironment,
    PostPublicIntegration,
    PostPublicQuickstartIntegration,
    PostPublicRotateWebhookSigningKey,
    PostPublicSyncPause,
    PostPublicSyncStart,
    PostRotateWebhookSigningKey,
    PostStripeCollectPayment,
    PostSyncVariant,
    PutBillingInvoicingDetails,
    PutPublicSyncConnectionFrequency,
    PutTeam,
    PutUpgradePreBuiltFlow,
    PutUserPassword,
    SetMetadata,
    UpdateMetadata
} from '@nangohq/types';
import type { Request, RequestHandler, Response } from 'express';

const logger = getLogger('Audit');

type AuditRequest<TEndpoint extends Endpoint<any>> = Request<TEndpoint['Params'], TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring']>;

type AuditableEndpoint = Endpoint<any> & { Audit: AuditPolicy };

const Audit = {
    auditable: <R extends AuditResource, A extends AuditActionOf<R>, S extends AuditScope>(policy: {
        resource: R;
        action: A;
        scope: S;
    }): AuditPolicy<R, A, S> => ({
        kind: 'audit',
        ...policy
    })
};

// Metadata is loosely typed here; per-event shapes live on the emit model (@nangohq/audit's AuditEvent).
type AuditSpec<TEndpoint extends AuditableEndpoint> = {
    policy: TEndpoint['Audit'];
    target?: (
        req: AuditRequest<TEndpoint>,
        locals: Partial<RequestLocals>
    ) => AuditTarget | AuditTarget[] | undefined | Promise<AuditTarget | AuditTarget[] | undefined>;
    // Created resources expose their id only in the response body — resolve the target from it at finish.
    // Runs only when `target` produced nothing, so a request-derived target always wins.
    targetFromResponse?: (
        response: TEndpoint['Success'],
        req: AuditRequest<TEndpoint>,
        locals: Partial<RequestLocals>
    ) => AuditTarget | AuditTarget[] | undefined | Promise<AuditTarget | AuditTarget[] | undefined>;
    metadata?: (
        req: AuditRequest<TEndpoint>,
        locals: Partial<RequestLocals>
    ) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;
    // Values known only after the handler responds (e.g. persisted scopes). Merged over request metadata at finish.
    metadataFromResponse?: (
        response: TEndpoint['Success'],
        req: AuditRequest<TEndpoint>,
        locals: Partial<RequestLocals>
    ) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;
    // Defaults to the authenticated account (res.locals.account). Override when the audited account is not
    // the caller's — e.g. accepting/declining an invite is recorded under the inviting team, not the invitee.
    account?: (req: AuditRequest<TEndpoint>, locals: Partial<RequestLocals>) => Promise<{ id: number; uuid: string } | undefined>;
};

function omitUndefined(obj: Record<string, unknown>): Record<string, unknown> | undefined {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            out[key] = value;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export const UNKNOWN_ACTOR: AuditActor = { type: 'unknown', id: 'unknown', display: 'unknown' };

export function resolveActor(locals: Partial<RequestLocals>): AuditActor {
    if (locals.authType === 'secretKey') {
        // Functions currently call the API with a secret key too, distinguished only by the
        // client-settable Nango-Is-Script header — spoofable, so we don't trust it for attribution.
        // Every secret-key caller is classified as api_key until functions get their own tokens.
        return {
            type: 'api_key',
            id: locals.apiKeyId != null ? String(locals.apiKeyId) : 'secret_key',
            ...(locals.apiKeyDisplayName ? { display: locals.apiKeyDisplayName } : {})
        };
    }
    // Basic auth and auth-disabled deployments authenticate a dashboard user without calling it a session.
    if (locals.user) {
        return { type: 'user', id: String(locals.user.id), display: locals.user.email };
    }
    return UNKNOWN_ACTOR;
}

export function contextFromRequest(req: Request): AuditContext {
    const context: AuditContext = { interface: 'api' };
    if (req.ip) {
        context.ip = req.ip;
    }
    const userAgent = req.get('user-agent');
    if (userAgent) {
        context.userAgent = userAgent;
    }
    return context;
}

export function outcomeFromStatus(status: number): AuditOutcome {
    if (status < 300) {
        return 'success';
    }
    if (status === 401 || status === 403) {
        return 'denied';
    }
    return 'failure';
}

// Low-RPS events only — never call this on a hot path (get-credentials derives displays from the request).
async function resolveDisplay(target: AuditTargetType, lookup: () => Promise<string | undefined>): Promise<string | undefined> {
    try {
        return await lookup();
    } catch (err) {
        logger.warning(`audit: failed to resolve ${target} display`, err);
        metrics.increment(metrics.Types.AUDIT_TARGET_DISPLAY_RESOLUTION_FAILED, 1, { target });
        return undefined;
    }
}

async function emit(
    policy: AuditPolicy,
    req: Request,
    res: Response,
    resolved: ResolvedAudit | undefined,
    account: { id: number },
    environment: RequestLocals['environment']
): Promise<void> {
    // Stamp occurredAt now so it reflects the response time, not audit-write latency.
    const occurredAt = new Date().toISOString();
    try {
        const locals = res.locals as Partial<RequestLocals>;
        const target = resolved?.target;
        const metadata = resolved?.metadata;
        const event = {
            occurredAt,
            accountId: account.id,
            environment: policy.scope === 'account' || !environment ? null : { id: environment.id, display: environment.name },
            actor: resolveActor(locals),
            resource: policy.resource,
            action: policy.action,
            targets: Array.isArray(target) ? target : target ? [target] : [],
            context: contextFromRequest(req),
            outcome: outcomeFromStatus(res.statusCode),
            ...(metadata ? { metadata } : {})
        } as AuditEvent;
        const result = await audit.record(event);
        if (result.isErr()) {
            logger.error(`failed to record audit event`, result.error);
        }
    } catch (err) {
        logger.error(`failed to emit audit event`, err);
    }
}

export function resolveAuditAttribution(req: Request, locals: Partial<RequestLocals>): AuditAttribution {
    return { actor: resolveActor(locals), context: contextFromRequest(req) };
}

interface ResolvedAudit {
    target: AuditTarget | AuditTarget[] | undefined;
    metadata: unknown;
}

// Place AFTER auth and BEFORE authorization so it captures every outcome — including 403 denials
// that never reach the controller.
export function auditable<TEndpoint extends AuditableEndpoint>(spec: AuditSpec<TEndpoint>): RequestHandler {
    return (req, res, next) => {
        void (async () => {
            try {
                const locals = res.locals as Partial<RequestLocals>;
                // Resolve the audited account before the flag gate: a spec may attribute the event to an
                // account other than the caller's (see AuditSpec.account), and the gate must use that one.
                const account = spec.account ? await spec.account(req, locals) : locals.account;
                // Freeze account + environment before the handler runs, for the same reason as target/metadata below.
                const environment = locals.environment;
                if (account && (await getFlags().isAuditTrailEnabled(account.uuid))) {
                    // Capture the response body only when a spec needs it — the id of a created resource is
                    // known only after the handler responds. Wrap res.json before next() runs the handler.
                    let responseBody: unknown;
                    if (spec.targetFromResponse || spec.metadataFromResponse) {
                        const originalJson = res.json.bind(res);
                        res.json = ((body: unknown) => {
                            responseBody = body;
                            return originalJson(body);
                        }) as typeof res.json;
                    }
                    // Register the finish listener only once we know we should audit — a disabled account
                    // never installs a dead listener. It reads `resolved` lazily at finish, so it captures
                    // whatever we managed to resolve (even nothing, if resolution threw).
                    let resolved: ResolvedAudit | undefined;
                    res.on('finish', () => {
                        void (async () => {
                            if (outcomeFromStatus(res.statusCode) === 'success' && responseBody !== undefined && resolved) {
                                if (spec.targetFromResponse && resolved.target === undefined) {
                                    try {
                                        resolved.target = await spec.targetFromResponse(responseBody as TEndpoint['Success'], req, locals);
                                    } catch (err) {
                                        logger.error(`failed to resolve audit target from response`, err);
                                    }
                                }
                                if (spec.metadataFromResponse) {
                                    try {
                                        const fromResponse = await spec.metadataFromResponse(responseBody as TEndpoint['Success'], req, locals);
                                        resolved.metadata = omitUndefined({
                                            ...(resolved.metadata && typeof resolved.metadata === 'object' ? resolved.metadata : {}),
                                            ...fromResponse
                                        });
                                    } catch (err) {
                                        logger.error(`failed to resolve audit metadata from response`, err);
                                    }
                                }
                            }
                            await emit(spec.policy, req, res, resolved, account, environment);
                        })();
                    });
                    // Resolve target and metadata before the handler runs — some handlers move or overwrite
                    // the pre-mutation state (a removed member, an old role).
                    resolved = {
                        target: spec.target ? await spec.target(req, locals) : undefined,
                        metadata: spec.metadata ? await spec.metadata(req, locals) : undefined
                    };
                }
            } catch (err) {
                logger.error(`failed to resolve audit target`, err);
            } finally {
                next();
            }
        })();
    };
}

// The deprecated single-connection metadata routes (POST/PATCH /connection/:connectionId/metadata)
// reuse the batch SetMetadata/UpdateMetadata endpoints but carry the connection in the path/query
// instead of the body. Those routes have no typed contract (their controllers take a raw Request), so
// these two reads stay untyped — the batch body fields they fall back to ARE typed on the resolver.
function param(req: Request<any, any, any, any>, key: string): unknown {
    return (req.params as Record<string, unknown>)[key];
}
function query(req: Request<any, any, any, any>, key: string): unknown {
    return (req.query as Record<string, unknown>)[key];
}
function providerConfigKeyMeta(value: unknown): { providerConfigKey: string } | undefined {
    return typeof value === 'string' && value.length > 0 ? { providerConfigKey: value } : undefined;
}
// The batch metadata endpoints accept connection_id as an array (body) — record one target per
// connection; the deprecated single-connection routes carry it in the path instead.
function connectionTargets(paramId: unknown, bodyId: string | string[] | undefined): AuditTarget | AuditTarget[] | undefined {
    if (Array.isArray(bodyId)) {
        return bodyId.map((id) => makeTarget('connection', id)).filter((t): t is AuditTarget => Boolean(t));
    }
    return makeTarget('connection', paramId ?? bodyId);
}
function connectionUpdatedMeta(providerConfigKey: string | undefined, fields: string[] | undefined): Record<string, unknown> | undefined {
    return omitUndefined({
        providerConfigKey: providerConfigKey && providerConfigKey.length > 0 ? providerConfigKey : undefined,
        changedFields: fields
    });
}
function syncFrequencyMeta(frequency: string | null | undefined, providerConfigKey: string | undefined): Record<string, unknown> | undefined {
    return omitUndefined({
        frequency: typeof frequency === 'string' ? frequency : undefined,
        providerConfigKey: typeof providerConfigKey === 'string' ? providerConfigKey : undefined
    });
}
function functionDeletedMeta(providerConfigKey: string | undefined, type: string | undefined): Record<string, unknown> | undefined {
    return omitUndefined({
        providerConfigKey: providerConfigKey && providerConfigKey.length > 0 ? providerConfigKey : undefined,
        // A sync and an action can share a name; `type` disambiguates which function was deleted.
        type: type ? type : undefined
    });
}
// Keep only the origin (scheme + host) of a URL — a webhook URL can carry a secret token in its path,
// query string, or userinfo, and this goes into the immutable audit record.
function safeUrl(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.length === 0) {
        return undefined;
    }
    try {
        const url = new URL(value);
        return url.origin;
    } catch {
        return undefined;
    }
}
// Target whose display is looked up from the DB best-effort; failures degrade to no display.
async function dbTarget(type: AuditTargetType, value: unknown, lookup: (id: string) => Promise<string | undefined>): Promise<AuditTarget | undefined> {
    const id = toId(value);
    if (!id) {
        return undefined;
    }
    const display = await resolveDisplay(type, () => lookup(id));
    return { type, id, ...(display ? { display } : {}) };
}

function memberTarget(req: Request<{ id: number }>, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    return dbTarget('member', req.params.id, async (id) => {
        if (!locals.account) {
            return undefined;
        }
        const user = await userService.getUserByIdAndAccountId(Number(id), locals.account.id);
        return user?.email;
    });
}

function syncTarget(value: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    return dbTarget('sync', value, async (id) => {
        const numericId = Number(id);
        if (Number.isNaN(numericId) || !locals.environment) {
            return undefined;
        }
        const syncConfig = await getSyncConfigById(locals.environment.id, numericId);
        return syncConfig?.sync_name;
    });
}

function apiKeyTarget(value: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    return dbTarget('api_key', value, async (id) => {
        if (!locals.environment) {
            return undefined;
        }
        const result = await customerKeyService.getApiKeysByEnv(db.knex, locals.environment.id);
        if (result.isErr()) {
            throw result.error;
        }
        return result.value.find((key) => String(key.id) === id)?.display_name;
    });
}

function accountApiKeyTarget(value: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    return dbTarget('api_key', value, async (id) => {
        const numericId = Number(id);
        // Audit runs before controller param validation; skip the DB lookup for non-numeric
        // keyIds so malformed deletes return 400 without an audit display-resolution warning.
        if (Number.isNaN(numericId) || !locals.account) {
            return undefined;
        }
        const result = await customerKeyService.getAccountApiKeyDisplayName(db.knex, numericId, locals.account.id);
        if (result.isErr()) {
            throw result.error;
        }
        return result.value;
    });
}

function publicEnvApiKeyTarget(keyId: unknown, environmentId: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    return dbTarget('api_key', keyId, async (id) => {
        const numericId = Number(id);
        const numericEnvId = Number(environmentId);
        if (Number.isNaN(numericId) || Number.isNaN(numericEnvId) || !locals.account) {
            return undefined;
        }
        const result = await customerKeyService.getApiKeyDisplayName(db.knex, numericId, numericEnvId, locals.account.id);
        if (result.isErr()) {
            throw result.error;
        }
        return result.value;
    });
}

function accountEnvironmentTarget(value: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    return dbTarget('environment', value, async (id) => {
        const numericId = Number(id);
        if (Number.isNaN(numericId) || !locals.account) {
            return undefined;
        }
        const environment = await environmentService.getByIdWithoutSecrets(numericId, locals.account.id);
        return environment?.name;
    });
}

export const auditConnectionRefreshed = auditable<PostConnectionRefresh>({
    policy: Audit.auditable({ resource: 'connection', action: 'refreshed', scope: 'environment' }),
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => providerConfigKeyMeta(req.query.provider_config_key)
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
export const auditPublicConnectionMetadataSet = auditable<SetMetadata>({
    policy: Audit.auditable({ resource: 'connection', action: 'metadata_updated', scope: 'environment' }),
    target: (req) => connectionTargets(param(req, 'connectionId'), req.body.connection_id),
    metadata: (req) => providerConfigKeyMeta(query(req, 'provider_config_key') ?? req.body.provider_config_key)
});
export const auditPublicConnectionMetadataUpdated = auditable<UpdateMetadata>({
    policy: Audit.auditable({ resource: 'connection', action: 'metadata_updated', scope: 'environment' }),
    target: (req) => connectionTargets(param(req, 'connectionId'), req.body.connection_id),
    metadata: (req) => providerConfigKeyMeta(query(req, 'provider_config_key') ?? req.body.provider_config_key)
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

export const auditIntegrationUpdated = auditable<PatchIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'updated', scope: 'environment' }),
    target: (req) => makeTarget('integration', req.params.providerConfigKey),
    metadata: (req) => {
        const fields = changedFields(req.body);
        return fields ? { changedFields: fields } : undefined;
    }
});
export const auditPublicIntegrationUpdated = auditable<PatchPublicIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'updated', scope: 'environment' }),
    target: (req) => makeTarget('integration', req.params.uniqueKey),
    metadata: (req) => {
        const fields = changedFields(req.body);
        return fields ? { changedFields: fields } : undefined;
    }
});
export const auditIntegrationDeleted = auditable<DeleteIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'deleted', scope: 'environment' }),
    target: (req) => makeTarget('integration', req.params.providerConfigKey)
});
export const auditPublicIntegrationDeleted = auditable<DeletePublicIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'deleted', scope: 'environment' }),
    target: (req) => makeTarget('integration', req.params.uniqueKey)
});

export const auditFunctionDeleted = auditable<DeleteIntegrationFunction>({
    policy: Audit.auditable({ resource: 'function', action: 'deleted', scope: 'environment' }),
    target: (req) => makeTarget('function', req.params.functionName),
    metadata: (req) => functionDeletedMeta(req.params.providerConfigKey, req.query.type)
});
export const auditPublicFunctionDeleted = auditable<DeletePublicIntegrationFunction>({
    policy: Audit.auditable({ resource: 'function', action: 'deleted', scope: 'environment' }),
    target: (req) => makeTarget('function', req.params.name),
    metadata: (req) => functionDeletedMeta(req.params.uniqueKey, req.query.type)
});

export const auditApiKeyUpdated = auditable<PatchApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'updated', scope: 'environment' }),
    target: (req, locals) => apiKeyTarget(req.params.keyId, locals),
    metadata: (req) =>
        omitUndefined({
            displayName: typeof req.body.display_name === 'string' ? req.body.display_name : undefined,
            scopes: Array.isArray(req.body.scopes) ? req.body.scopes.filter((s) => typeof s === 'string') : undefined
        })
});
export const auditApiKeyDeleted = auditable<DeleteApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'deleted', scope: 'environment' }),
    target: (req, locals) => apiKeyTarget(req.params.keyId, locals)
});
export const auditPublicApiKeyDeleted = auditable<DeletePublicApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'deleted', scope: 'account' }),
    target: (req, locals) => publicEnvApiKeyTarget(req.body.key_id, req.body.environment_id, locals),
    metadata: (req) => omitUndefined({ environmentId: req.body.environment_id })
});
export const auditAccountApiKeyDeleted = auditable<DeleteAccountApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'deleted', scope: 'account' }),
    target: (req, locals) => accountApiKeyTarget(req.params.keyId, locals)
});

export const auditSyncEnabled = auditable<PatchFlowEnable>({
    policy: Audit.auditable({ resource: 'sync', action: 'enabled', scope: 'environment' }),
    target: (req, locals) => syncTarget(req.params.id, locals)
});
export const auditSyncDisabled = auditable<PatchFlowDisable>({
    policy: Audit.auditable({ resource: 'sync', action: 'disabled', scope: 'environment' }),
    target: (req, locals) => syncTarget(req.params.id, locals)
});
export const auditSyncFrequencyChanged = auditable<PatchFlowFrequency>({
    policy: Audit.auditable({ resource: 'sync', action: 'frequency_changed', scope: 'environment' }),
    target: (req, locals) => syncTarget(req.params.id, locals),
    // Private route sends camelCase `providerConfigKey`.
    metadata: (req) => syncFrequencyMeta(req.body.frequency, req.body.providerConfigKey)
});
export const auditPublicSyncFrequencyChanged = auditable<PutPublicSyncConnectionFrequency>({
    policy: Audit.auditable({ resource: 'sync', action: 'frequency_changed', scope: 'environment' }),
    target: (req, locals) => syncTarget(req.body.sync_name, locals),
    // Public route sends snake_case `provider_config_key`.
    metadata: (req) => syncFrequencyMeta(req.body.frequency, req.body.provider_config_key)
});
export const auditSyncVariantCreated = auditable<PostSyncVariant>({
    policy: Audit.auditable({ resource: 'sync', action: 'variant_created', scope: 'environment' }),
    target: (req) => makeTarget('sync', req.params.name),
    metadata: (req) => ({ variant: req.params.variant })
});
export const auditSyncVariantDeleted = auditable<DeleteSyncVariant>({
    policy: Audit.auditable({ resource: 'sync', action: 'variant_deleted', scope: 'environment' }),
    target: (req) => makeTarget('sync', req.params.name),
    metadata: (req) => ({ variant: req.params.variant })
});

export const auditMemberRemoved = auditable<DeleteTeamUser>({
    policy: Audit.auditable({ resource: 'member', action: 'removed', scope: 'account' }),
    target: memberTarget
});
export const auditMemberRoleChanged = auditable<PatchTeamUser>({
    policy: Audit.auditable({ resource: 'member', action: 'role_changed', scope: 'account' }),
    target: memberTarget,
    metadata: async (req, locals) => {
        const role = req.body.role;
        let fromRole: string | undefined;
        const id = toId(req.params.id);
        if (id && locals.account) {
            const accountId = locals.account.id;
            fromRole = await resolveDisplay('member', async () => {
                const user = await userService.getUserByIdAndAccountId(Number(id), accountId);
                return user?.role;
            });
        }
        return omitUndefined({
            toRole: typeof role === 'string' ? role : undefined,
            fromRole: fromRole ? fromRole : undefined
        });
    }
});
export const auditTeamUpdated = auditable<PutTeam>({
    policy: Audit.auditable({ resource: 'team', action: 'updated', scope: 'account' }),
    target: (_req, locals) => makeTarget('team', locals.account?.id, locals.account?.name),
    metadata: (req) => {
        const name = req.body.name;
        return typeof name === 'string' ? { name } : undefined;
    }
});
export const auditUserUpdated = auditable<PatchUser>({
    policy: Audit.auditable({ resource: 'user', action: 'updated', scope: 'account' }),
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});

export const auditEnvironmentDeleted = auditable<DeleteEnvironment>({
    policy: Audit.auditable({ resource: 'environment', action: 'deleted', scope: 'environment' }),
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name)
});
export const auditPublicEnvironmentDeleted = auditable<DeletePublicEnvironment>({
    policy: Audit.auditable({ resource: 'environment', action: 'deleted', scope: 'account' }),
    target: (req, locals) => accountEnvironmentTarget(req.params.environmentId, locals)
});
export const auditEnvironmentUpdated = auditable<PatchEnvironment>({
    policy: Audit.auditable({ resource: 'environment', action: 'updated', scope: 'environment' }),
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name),
    metadata: (req) =>
        omitUndefined({
            name: typeof req.body.name === 'string' ? req.body.name : undefined,
            changedFields: changedFields(req.body)
        })
});
export const auditEnvironmentVariablesChanged = auditable<PostEnvironmentVariables>({
    policy: Audit.auditable({ resource: 'environment', action: 'variables_changed', scope: 'environment' }),
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name),
    metadata: (req) => {
        const variables = req.body.variables;
        if (!Array.isArray(variables)) {
            return undefined;
        }
        const variableNames = variables
            .map((v) => (v && typeof v === 'object' ? (v as Record<string, unknown>)['name'] : undefined))
            .filter((n): n is string => typeof n === 'string');
        return omitUndefined({ variableCount: variables.length, variableNames: variableNames.length > 0 ? variableNames : undefined });
    }
});
export const auditWebhookSigningKeyRotated = auditable<PostRotateWebhookSigningKey>({
    policy: Audit.auditable({ resource: 'environment', action: 'webhook_signing_key_rotated', scope: 'environment' }),
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name)
});
export const auditPublicWebhookSigningKeyRotated = auditable<PostPublicRotateWebhookSigningKey>({
    policy: Audit.auditable({ resource: 'environment', action: 'webhook_signing_key_rotated', scope: 'environment' }),
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name)
});
export const auditEnvironmentWebhookUrlsChanged = auditable<PatchWebhook>({
    policy: Audit.auditable({ resource: 'environment', action: 'webhook_urls_changed', scope: 'environment' }),
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name),
    metadata: (req) =>
        omitUndefined({
            primaryUrl: safeUrl(req.body.primary_url),
            secondaryUrl: safeUrl(req.body.secondary_url)
        })
});

export const auditBillingPlanChanged = auditable<PostPlanChange>({
    policy: Audit.auditable({ resource: 'billing', action: 'plan_changed', scope: 'account' }),
    metadata: (req, locals) =>
        omitUndefined({
            toPlan: typeof req.body.orbId === 'string' ? req.body.orbId : undefined,
            fromPlan: locals.plan?.name || undefined
        })
});
export const auditBillingTrialExtended = auditable<PostPlanExtendTrial>({
    policy: Audit.auditable({ resource: 'billing', action: 'trial_extended', scope: 'account' })
});
export const auditBillingDetailsChanged = auditable<PutBillingInvoicingDetails>({
    policy: Audit.auditable({ resource: 'billing', action: 'details_changed', scope: 'account' })
});
// SetupIntent only — pm id isn't known yet (arrives via webhook); response is just a client secret, so nothing to record.
export const auditBillingPaymentMethodAdded = auditable<PostStripeCollectPayment>({
    policy: Audit.auditable({ resource: 'billing', action: 'payment_method_added', scope: 'account' })
});
export const auditBillingPaymentMethodRemoved = auditable<DeleteStripePayment>({
    policy: Audit.auditable({ resource: 'billing', action: 'payment_method_removed', scope: 'account' }),
    metadata: (req) =>
        typeof req.query.payment_id === 'string' && req.query.payment_id.length > 0 && req.query.payment_id.length <= 255
            ? { paymentMethodId: req.query.payment_id }
            : undefined
});

export const auditAppAuthPasswordChanged = auditable<PutUserPassword>({
    policy: Audit.auditable({ resource: 'app_auth', action: 'password_changed', scope: 'account' }),
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});

// The sync pause/start bodies accept `syncs` as either a name or a `{ name, variant }` object.
function syncTargetsFromBody(syncs: (string | { name: string; variant: string })[]): AuditTarget[] | undefined {
    if (!Array.isArray(syncs)) {
        return undefined;
    }
    const targets = syncs
        .map((sync) => (typeof sync === 'string' ? makeTarget('sync', sync) : makeTarget('sync', sync.name, sync.variant)))
        .filter((t): t is AuditTarget => Boolean(t));
    return targets.length > 0 ? targets : undefined;
}

export const auditIntegrationCreated = auditable<PostIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'created', scope: 'environment' }),
    // The final unique_key is only certain in the response — the private path omits it from the request.
    targetFromResponse: (response) => makeTarget('integration', response.data.unique_key),
    metadata: (req) => omitUndefined({ provider: req.body.provider })
});
export const auditPublicIntegrationCreated = auditable<PostPublicIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'created', scope: 'environment' }),
    targetFromResponse: (response) => makeTarget('integration', response.data.unique_key),
    metadata: (req) => omitUndefined({ provider: req.body.provider })
});
export const auditPublicQuickstartIntegrationCreated = auditable<PostPublicQuickstartIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'created', scope: 'environment' }),
    targetFromResponse: (response) => makeTarget('integration', response.data.unique_key),
    metadata: (req) => omitUndefined({ provider: req.body.provider })
});

export const auditEnvironmentCreated = auditable<PostEnvironment>({
    policy: Audit.auditable({ resource: 'environment', action: 'created', scope: 'account' }),
    targetFromResponse: (response) => makeTarget('environment', response.data.id, response.data.name),
    metadata: (req) => omitUndefined({ name: req.body.name })
});
export const auditPublicEnvironmentCreated = auditable<PostPublicEnvironment>({
    policy: Audit.auditable({ resource: 'environment', action: 'created', scope: 'account' }),
    targetFromResponse: (response) => makeTarget('environment', response.data.id, response.data.name),
    metadata: (req) => omitUndefined({ name: req.body.name })
});

export const auditApiKeyCreated = auditable<CreateApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'created', scope: 'environment' }),
    // Never read the secret from the response — only the id and display name identify the key.
    targetFromResponse: (response) => makeTarget('api_key', response.data.id, response.data.display_name),
    metadata: (req) =>
        omitUndefined({
            displayName: req.body.display_name,
            scopes: req.body.scopes
        })
});
export const auditPublicApiKeyCreated = auditable<PostPublicApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'created', scope: 'account' }),
    targetFromResponse: (response) => makeTarget('api_key', response.data.id, response.data.display_name),
    metadata: (req) => omitUndefined({ displayName: req.body.display_name, environmentId: req.body.environment_id })
});
export const auditAccountApiKeyCreated = auditable<CreateAccountApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'created', scope: 'account' }),
    targetFromResponse: (response) => makeTarget('api_key', response.data.id, response.data.display_name),
    metadata: (req) => omitUndefined({ displayName: req.body.display_name }),
    // Scopes are chosen by the service/controller today and will be request-configurable later —
    // always record what was actually persisted.
    metadataFromResponse: (response) => omitUndefined({ scopes: response.data.scopes })
});

export const auditMemberInvited = auditable<PostInvite>({
    policy: Audit.auditable({ resource: 'member', action: 'invited', scope: 'account' }),
    // Invitees have no user id yet — the email is their identity. One target per invited email.
    target: (req) =>
        Array.isArray(req.body.emails)
            ? req.body.emails.map((email) => makeTarget('member', email, email)).filter((t): t is AuditTarget => Boolean(t))
            : undefined,
    metadata: (req) => (req.body.role ? { role: req.body.role } : undefined)
});
export const auditMemberInviteRevoked = auditable<DeleteInvite>({
    policy: Audit.auditable({ resource: 'member', action: 'invite_revoked', scope: 'account' }),
    target: (req) => makeTarget('member', req.body.email, req.body.email)
});
// Recorded under the inviting team (like invited/revoked), not the invitee's own account: locals.account
// is the accepter's pre-existing account, so resolve the target account from the invitation instead. The
// invite still exists here (resolved before the handler consumes it).
async function invitingAccount(req: Request<{ id: string }>): Promise<{ id: number; uuid: string } | undefined> {
    const invitation = await getInvitation(req.params.id);
    if (!invitation) {
        return undefined;
    }
    return (await accountService.getAccountById(db.knex, invitation.account_id)) ?? undefined;
}

// Accept/decline run under webAuth, so the acting user IS the invited member — the actor is resolved
// from the session and the target email comes from locals, keeping the member identity (email)
// consistent with the invited/revoked events. The invite token (req.params.id) is not a member identity.
export const auditMemberInviteAccepted = auditable<AcceptInvite>({
    policy: Audit.auditable({ resource: 'member', action: 'invite_accepted', scope: 'account' }),
    account: invitingAccount,
    target: (_req, locals) => makeTarget('member', locals.user?.email, locals.user?.email)
});
export const auditMemberInviteDeclined = auditable<DeclineInvite>({
    policy: Audit.auditable({ resource: 'member', action: 'invite_declined', scope: 'account' }),
    account: invitingAccount,
    target: (_req, locals) => makeTarget('member', locals.user?.email, locals.user?.email)
});

export const auditFunctionDeployed = auditable<PostFunctionDeployment>({
    policy: Audit.auditable({ resource: 'function', action: 'deployed', scope: 'environment' }),
    target: (req) => makeTarget('function', req.body.type === 'function' ? req.body.function_name : req.body.template),
    metadata: (req) =>
        omitUndefined({
            providerConfigKey: req.body.integration_id,
            type: req.body.function_type
        })
});
export const auditFunctionDeployedCli = auditable<PostDeploy>({
    policy: Audit.auditable({ resource: 'function', action: 'deployed', scope: 'environment' }),
    // Bulk CLI deploy — one target per flow, its script type carried as the display.
    target: (req) =>
        Array.isArray(req.body.flowConfigs)
            ? req.body.flowConfigs.map((flow) => makeTarget('function', flow.syncName, flow.type)).filter((t): t is AuditTarget => Boolean(t))
            : undefined
});

function functionBundleTargets(value: unknown): AuditTarget[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value
        .map((artifact: unknown) => {
            if (typeof artifact !== 'object' || artifact === null) {
                return undefined;
            }
            const { integrationId, name } = artifact as { integrationId?: unknown; name?: unknown };
            if (typeof integrationId !== 'string' || integrationId.length === 0 || typeof name !== 'string' || name.length === 0) {
                return undefined;
            }
            return makeTarget('function', `${integrationId}:${name}`, name);
        })
        .filter((target): target is AuditTarget => Boolean(target));
}

export const auditFunctionDeploymentBundle = auditable<PostFunctionDeploymentBundle>({
    policy: Audit.auditable({ resource: 'function', action: 'deployed', scope: 'environment' }),
    target: (req) => functionBundleTargets(req.body.functions),
    metadata: () => ({ type: 'function' })
});

export const auditPreBuiltDeployed = auditable<PostPreBuiltDeploy>({
    policy: Audit.auditable({ resource: 'function', action: 'deployed', scope: 'environment' }),
    target: (req) => makeTarget('function', req.body.scriptName),
    metadata: (req) => omitUndefined({ providerConfigKey: req.body.providerConfigKey, type: req.body.type })
});

export const auditFunctionUpgraded = auditable<PutUpgradePreBuiltFlow>({
    policy: Audit.auditable({ resource: 'function', action: 'upgraded', scope: 'environment' }),
    target: (req) => makeTarget('function', req.body.scriptName),
    metadata: (req) => omitUndefined({ providerConfigKey: req.body.providerConfigKey, upgradeVersion: req.body.upgradeVersion })
});

export const auditSyncPaused = auditable<PostPublicSyncPause>({
    policy: Audit.auditable({ resource: 'sync', action: 'paused', scope: 'environment' }),
    target: (req) => syncTargetsFromBody(req.body.syncs),
    metadata: (req) => providerConfigKeyMeta(req.body.provider_config_key)
});
export const auditSyncStarted = auditable<PostPublicSyncStart>({
    policy: Audit.auditable({ resource: 'sync', action: 'started', scope: 'environment' }),
    target: (req) => syncTargetsFromBody(req.body.syncs),
    metadata: (req) => providerConfigKeyMeta(req.body.provider_config_key)
});

// MFA factors are per-user and account-scoped; the acting user is always the target. No metadata is
// recorded — the request bodies carry only TOTP/recovery codes, which must never be persisted.
export const auditMfaEnrolled = auditable<PostMFAEnrollment>({
    policy: Audit.auditable({ resource: 'mfa', action: 'enrolled', scope: 'account' }),
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});
export const auditMfaEnabled = auditable<PostMFAActivation>({
    policy: Audit.auditable({ resource: 'mfa', action: 'enabled', scope: 'account' }),
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});
export const auditMfaDisabled = auditable<DeleteMFA>({
    policy: Audit.auditable({ resource: 'mfa', action: 'disabled', scope: 'account' }),
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});
export const auditMfaRecoveryRegenerated = auditable<PostMFARecoveryCodes>({
    policy: Audit.auditable({ resource: 'mfa', action: 'recovery_regenerated', scope: 'account' }),
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});

const METHOD_BY_TYPE = { code: 'totp', recoveryCode: 'recovery_code' } as const;

// Anchor the event's resource/action to the endpoint's declared Audit policy so this dedicated middleware
// can't drift from it — the typed auditable() specs get the same guarantee for free via AuditSpec.policy.
const mfaVerifiedPolicy: PostMFALoginVerification['Audit'] = { kind: 'audit', resource: 'mfa', action: 'verified', scope: 'account' };

// The login-verify route runs BEFORE authentication (the user is mid-login), so res.locals carries no
// user or account and the standard locals-based auditable() can't attribute the event — and emit()
// early-returns without an account. Resolve the acting user from the pending-login session (it still
// exists at middleware entry; the controller deletes it once verification succeeds), load their
// account directly, and emit an `mfa`/`verified` event on finish for both success and failure.
export const auditMfaVerified: RequestHandler = (req, res, next) => {
    // Capture the pending user synchronously — the controller clears the pending session on success.
    const userId = req.session.pendingMfaLogin?.userId;
    res.on('finish', () => {
        void emitMfaVerified(req, res, userId);
    });
    next();
};

async function emitMfaVerified(req: Request, res: Response, pendingUserId: number | undefined): Promise<void> {
    const occurredAt = new Date().toISOString();
    try {
        // Attribute to the pending-login user captured at middleware entry — equal to req.user on success,
        // and the only attribution available on failure. No pending challenge means there is nothing to audit.
        if (pendingUserId == null) {
            return;
        }
        const user = await userService.getUserById(pendingUserId, true);
        if (!user) {
            return;
        }
        const account = await accountService.getAccountById(db.knex, user.account_id);
        if (!account) {
            return;
        }
        if (!(await getFlags().isAuditTrailEnabled(account.uuid))) {
            return;
        }
        const bodyType = (req.body as Partial<PostMFALoginVerification['Body']>)?.type;
        const method: MfaVerifiedMetadata['method'] | undefined = bodyType && Object.hasOwn(METHOD_BY_TYPE, bodyType) ? METHOD_BY_TYPE[bodyType] : undefined;
        const event: AuditEvent = {
            occurredAt,
            accountId: account.id,
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            resource: mfaVerifiedPolicy.resource,
            action: mfaVerifiedPolicy.action,
            targets: [{ type: 'user', id: String(user.id), display: user.email }],
            context: contextFromRequest(req),
            outcome: outcomeFromStatus(res.statusCode),
            ...(method ? { metadata: { method } } : {})
        };
        const result = await audit.record(event);
        if (result.isErr()) {
            logger.error(`failed to record audit event`, result.error);
        }
    } catch (err) {
        logger.error(`failed to emit mfa verify audit event`, err);
    }
}
