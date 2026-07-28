import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { customerKeyService, getSyncConfigById, userService } from '@nangohq/shared';
import { getLogger, metrics } from '@nangohq/utils';

import { audit } from '../audit.js';

import type { RequestLocals } from '../utils/express.js';
import type { AuditActor, AuditContext, AuditEvent, AuditOutcome, AuditTarget, AuditTargetType } from '@nangohq/audit';
import type {
    AuditEndpointPolicy,
    DeleteApiKey,
    DeleteConnection,
    DeleteEnvironment,
    DeleteIntegration,
    DeleteIntegrationFunction,
    DeletePublicConnection,
    DeletePublicIntegration,
    DeletePublicIntegrationFunction,
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
    PostEnvironmentVariables,
    PostPlanChange,
    PostPlanExtendTrial,
    PostSyncVariant,
    PutBillingInvoicingDetails,
    PutPublicSyncConnectionFrequency,
    PutTeam,
    PutUserPassword,
    SetMetadata,
    UpdateMetadata
} from '@nangohq/types';
import type { Request, RequestHandler, Response } from 'express';

const logger = getLogger('Audit');

type AuditRequest<TEndpoint extends Endpoint<any>> = Request<TEndpoint['Params'], TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring']>;

type AuditableEndpoint = Endpoint<any> & { Audit: AuditEndpointPolicy };

// The identity comes from the endpoint's own `Audit` declaration (so wiring can't disagree with it);
// the spec only adds the runtime resolvers. Metadata is best-effort and loosely typed here — the
// per-event shapes are documented on the emit model (@nangohq/audit's AuditEvent).
export type AuditSpec<TEndpoint extends AuditableEndpoint> = Omit<TEndpoint['Audit'], 'kind'> & {
    target?: (
        req: AuditRequest<TEndpoint>,
        locals: RequestLocals
    ) => AuditTarget | AuditTarget[] | undefined | Promise<AuditTarget | AuditTarget[] | undefined>;
    metadata?: (req: AuditRequest<TEndpoint>, locals: RequestLocals) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;
};

function toId(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value.length > 0 ? value : undefined;
    }
    return typeof value === 'number' ? String(value) : undefined;
}

function makeTarget(type: AuditTargetType, value: unknown, display?: string): AuditTarget | undefined {
    const id = toId(value);
    return id ? { type, id, ...(display ? { display } : {}) } : undefined;
}

function resolveActor(locals: RequestLocals): AuditActor {
    if (locals.authType === 'session' && locals.user) {
        return { type: 'user', id: String(locals.user.id), display: locals.user.email };
    }
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
    return { type: 'system', id: locals.account ? String(locals.account.id) : 'unknown' };
}

function contextFromRequest(req: Request): AuditContext {
    const context: AuditContext = {};
    if (req.ip) {
        context.ip = req.ip;
    }
    const userAgent = req.get('user-agent');
    if (userAgent) {
        context.userAgent = userAgent;
    }
    return context;
}

function outcomeFromStatus(status: number): AuditOutcome {
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
    spec: Omit<AuditEndpointPolicy, 'kind'>,
    req: Request,
    res: Response,
    enabled: boolean,
    resolved: ResolvedAudit | undefined
): Promise<void> {
    // Stamp occurredAt now so it reflects the response time, not audit-write latency.
    const occurredAt = new Date().toISOString();
    try {
        if (!enabled) {
            return;
        }
        const locals = res.locals as RequestLocals;
        const { account, environment } = locals;
        if (!account) {
            return;
        }
        const target = resolved?.target;
        const metadata = resolved?.metadata;
        const event = {
            occurredAt,
            accountId: account.id,
            environment: spec.scope === 'account' || !environment ? null : { id: environment.id, display: environment.name },
            actor: resolveActor(locals),
            resource: spec.resource,
            action: spec.action,
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

interface ResolvedAudit {
    target: AuditTarget | AuditTarget[] | undefined;
    metadata: unknown;
}

// Place AFTER auth and BEFORE authorization so it captures every outcome — including 403 denials
// that never reach the controller.
export function auditable<TEndpoint extends AuditableEndpoint>(spec: AuditSpec<TEndpoint>): RequestHandler {
    return (req, res, next) => {
        // Resolve target and metadata before the handler runs — some handlers move or overwrite the
        // pre-mutation state (a removed member, an old role) — then emit on finish. The audit-enabled
        // flag is checked once here (not again in emit) so a single check drives both phases.
        let enabled = false;
        let resolved: ResolvedAudit | undefined;
        res.on('finish', () => {
            void emit(spec, req, res, enabled, resolved);
        });
        void (async () => {
            try {
                const locals = res.locals as RequestLocals;
                if (locals.account && (await getFlags().isAuditTrailEnabled(locals.account.uuid))) {
                    enabled = true;
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
    const meta: { providerConfigKey?: string; changedFields?: string[] } = {};
    if (providerConfigKey && providerConfigKey.length > 0) {
        meta.providerConfigKey = providerConfigKey;
    }
    if (fields) {
        meta.changedFields = fields;
    }
    return Object.keys(meta).length > 0 ? meta : undefined;
}
function syncFrequencyMeta(frequency: string | null | undefined, providerConfigKey: string | undefined): Record<string, unknown> | undefined {
    const meta: { providerConfigKey?: string; frequency?: string } = {};
    if (typeof frequency === 'string') {
        meta.frequency = frequency;
    }
    if (typeof providerConfigKey === 'string') {
        meta.providerConfigKey = providerConfigKey;
    }
    return Object.keys(meta).length > 0 ? meta : undefined;
}
function functionDeletedMeta(providerConfigKey: string | undefined, type: string | undefined): Record<string, unknown> | undefined {
    const meta: { providerConfigKey?: string; type?: string } = {};
    if (providerConfigKey && providerConfigKey.length > 0) {
        meta.providerConfigKey = providerConfigKey;
    }
    // A sync and an action can share a name; `type` disambiguates which function was deleted.
    if (type) {
        meta.type = type;
    }
    return Object.keys(meta).length > 0 ? meta : undefined;
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
const CHANGED_FIELDS_MAX = 30;
const CHANGED_FIELD_KEY_MAX = 64;
// Names of the fields present in the request body — never their values, so secrets never leak.
function changedFields(req: Request<any, any, any, any>): string[] | undefined {
    if (!req.body || typeof req.body !== 'object') {
        return undefined;
    }
    const keys = Object.keys(req.body as Record<string, unknown>)
        .filter((key) => key.length <= CHANGED_FIELD_KEY_MAX)
        .slice(0, CHANGED_FIELDS_MAX);
    return keys.length > 0 ? keys : undefined;
}
async function memberTarget(req: Request<{ id: number }>, locals: RequestLocals): Promise<AuditTarget | undefined> {
    const id = toId(req.params.id);
    if (!id) {
        return undefined;
    }
    const display = await resolveDisplay('member', async () => {
        if (!locals.account) {
            return undefined;
        }
        const user = await userService.getUserByIdAndAccountId(Number(id), locals.account.id);
        return user?.email;
    });
    return { type: 'member', id, ...(display ? { display } : {}) };
}

async function syncTarget(value: unknown, locals: RequestLocals): Promise<AuditTarget | undefined> {
    const id = toId(value);
    if (!id) {
        return undefined;
    }
    const numericId = Number(id);
    const display = Number.isNaN(numericId)
        ? undefined
        : await resolveDisplay('sync', async () => {
              if (!locals.environment) {
                  return undefined;
              }
              const syncConfig = await getSyncConfigById(locals.environment.id, numericId);
              return syncConfig?.sync_name;
          });
    return { type: 'sync', id, ...(display ? { display } : {}) };
}

async function apiKeyTarget(value: unknown, locals: RequestLocals): Promise<AuditTarget | undefined> {
    const id = toId(value);
    if (!id) {
        return undefined;
    }
    const display = await resolveDisplay('api_key', async () => {
        if (!locals.environment) {
            return undefined;
        }
        const result = await customerKeyService.getApiKeysByEnv(db.knex, locals.environment.id);
        return result.isOk() ? result.value.find((key) => String(key.id) === id)?.display_name : undefined;
    });
    return { type: 'api_key', id, ...(display ? { display } : {}) };
}

export const auditConnectionRefreshed = auditable<PostConnectionRefresh>({
    resource: 'connection',
    action: 'refreshed',
    scope: 'environment',
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => providerConfigKeyMeta(req.query.provider_config_key)
});
export const auditConnectionUpdated = auditable<PatchConnection>({
    resource: 'connection',
    action: 'updated',
    scope: 'environment',
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => connectionUpdatedMeta(req.query.provider_config_key, changedFields(req))
});
export const auditPublicConnectionUpdated = auditable<PatchPublicConnection>({
    resource: 'connection',
    action: 'updated',
    scope: 'environment',
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => connectionUpdatedMeta(req.query.provider_config_key, changedFields(req))
});
export const auditConnectionMetadataUpdated = auditable<PostConnectionMetadata>({
    resource: 'connection',
    action: 'metadata_updated',
    scope: 'environment',
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => providerConfigKeyMeta(req.query.provider_config_key)
});
export const auditPublicConnectionMetadataSet = auditable<SetMetadata>({
    resource: 'connection',
    action: 'metadata_updated',
    scope: 'environment',
    // The batch metadata endpoints accept connection_id as an array — record one target per connection.
    target: (req) => connectionTargets(param(req, 'connectionId'), req.body.connection_id),
    metadata: (req) => providerConfigKeyMeta(query(req, 'provider_config_key') ?? req.body.provider_config_key)
});
export const auditPublicConnectionMetadataUpdated = auditable<UpdateMetadata>({
    resource: 'connection',
    action: 'metadata_updated',
    scope: 'environment',
    target: (req) => connectionTargets(param(req, 'connectionId'), req.body.connection_id),
    metadata: (req) => providerConfigKeyMeta(query(req, 'provider_config_key') ?? req.body.provider_config_key)
});
export const auditConnectionDeleted = auditable<DeleteConnection>({
    resource: 'connection',
    action: 'deleted',
    scope: 'environment',
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => providerConfigKeyMeta(req.query.provider_config_key)
});
export const auditPublicConnectionDeleted = auditable<DeletePublicConnection>({
    resource: 'connection',
    action: 'deleted',
    scope: 'environment',
    target: (req) => makeTarget('connection', req.params.connectionId),
    metadata: (req) => providerConfigKeyMeta(req.query.provider_config_key)
});

export const auditIntegrationUpdated = auditable<PatchIntegration>({
    resource: 'integration',
    action: 'updated',
    scope: 'environment',
    target: (req) => makeTarget('integration', req.params.providerConfigKey),
    metadata: (req) => {
        const fields = changedFields(req);
        return fields ? { changedFields: fields } : undefined;
    }
});
export const auditPublicIntegrationUpdated = auditable<PatchPublicIntegration>({
    resource: 'integration',
    action: 'updated',
    scope: 'environment',
    target: (req) => makeTarget('integration', req.params.uniqueKey),
    metadata: (req) => {
        const fields = changedFields(req);
        return fields ? { changedFields: fields } : undefined;
    }
});
export const auditIntegrationDeleted = auditable<DeleteIntegration>({
    resource: 'integration',
    action: 'deleted',
    scope: 'environment',
    target: (req) => makeTarget('integration', req.params.providerConfigKey)
});
export const auditPublicIntegrationDeleted = auditable<DeletePublicIntegration>({
    resource: 'integration',
    action: 'deleted',
    scope: 'environment',
    target: (req) => makeTarget('integration', req.params.uniqueKey)
});

export const auditFunctionDeleted = auditable<DeleteIntegrationFunction>({
    resource: 'function',
    action: 'deleted',
    scope: 'environment',
    target: (req) => makeTarget('function', req.params.functionName),
    metadata: (req) => functionDeletedMeta(req.params.providerConfigKey, req.query.type)
});
export const auditPublicFunctionDeleted = auditable<DeletePublicIntegrationFunction>({
    resource: 'function',
    action: 'deleted',
    scope: 'environment',
    target: (req) => makeTarget('function', req.params.name),
    metadata: (req) => functionDeletedMeta(req.params.uniqueKey, req.query.type)
});

export const auditApiKeyUpdated = auditable<PatchApiKey>({
    resource: 'api_key',
    action: 'updated',
    scope: 'environment',
    target: (req, locals) => apiKeyTarget(req.params.keyId, locals),
    metadata: (req) => {
        const meta: { displayName?: string; scopes?: string[] } = {};
        const displayName = req.body.display_name;
        if (typeof displayName === 'string') {
            meta.displayName = displayName;
        }
        const scopes = req.body.scopes;
        if (Array.isArray(scopes)) {
            meta.scopes = scopes.filter((s) => typeof s === 'string');
        }
        return Object.keys(meta).length > 0 ? meta : undefined;
    }
});
export const auditApiKeyDeleted = auditable<DeleteApiKey>({
    resource: 'api_key',
    action: 'deleted',
    scope: 'environment',
    target: (req, locals) => apiKeyTarget(req.params.keyId, locals)
});

export const auditSyncEnabled = auditable<PatchFlowEnable>({
    resource: 'sync',
    action: 'enabled',
    scope: 'environment',
    target: (req, locals) => syncTarget(req.params.id, locals)
});
export const auditSyncDisabled = auditable<PatchFlowDisable>({
    resource: 'sync',
    action: 'disabled',
    scope: 'environment',
    target: (req, locals) => syncTarget(req.params.id, locals)
});
export const auditSyncFrequencyChanged = auditable<PatchFlowFrequency>({
    resource: 'sync',
    action: 'frequency_changed',
    scope: 'environment',
    target: (req, locals) => syncTarget(req.params.id, locals),
    // Private route sends camelCase `providerConfigKey`.
    metadata: (req) => syncFrequencyMeta(req.body.frequency, req.body.providerConfigKey)
});
export const auditPublicSyncFrequencyChanged = auditable<PutPublicSyncConnectionFrequency>({
    resource: 'sync',
    action: 'frequency_changed',
    scope: 'environment',
    target: (req, locals) => syncTarget(req.body.sync_name, locals),
    // Public route sends snake_case `provider_config_key`.
    metadata: (req) => syncFrequencyMeta(req.body.frequency, req.body.provider_config_key)
});
export const auditSyncVariantCreated = auditable<PostSyncVariant>({
    resource: 'sync',
    action: 'variant_created',
    scope: 'environment',
    target: (req) => makeTarget('sync', req.params.name),
    metadata: (req) => ({ variant: req.params.variant })
});
export const auditSyncVariantDeleted = auditable<DeleteSyncVariant>({
    resource: 'sync',
    action: 'variant_deleted',
    scope: 'environment',
    target: (req) => makeTarget('sync', req.params.name),
    metadata: (req) => ({ variant: req.params.variant })
});

export const auditMemberRemoved = auditable<DeleteTeamUser>({
    resource: 'member',
    action: 'removed',
    scope: 'account',
    target: memberTarget
});
export const auditMemberRoleChanged = auditable<PatchTeamUser>({
    resource: 'member',
    action: 'role_changed',
    scope: 'account',
    target: memberTarget,
    metadata: async (req, locals) => {
        const meta: { fromRole?: string; toRole?: string } = {};
        const role = req.body.role;
        if (typeof role === 'string') {
            meta.toRole = role;
        }
        const id = toId(req.params.id);
        if (id && locals.account) {
            const accountId = locals.account.id;
            const fromRole = await resolveDisplay('member', async () => {
                const user = await userService.getUserByIdAndAccountId(Number(id), accountId);
                return user?.role;
            });
            if (fromRole) {
                meta.fromRole = fromRole;
            }
        }
        return Object.keys(meta).length > 0 ? meta : undefined;
    }
});
export const auditTeamUpdated = auditable<PutTeam>({
    resource: 'team',
    action: 'updated',
    scope: 'account',
    target: (_req, locals) => makeTarget('team', locals.account?.id, locals.account?.name),
    metadata: (req) => {
        const name = req.body.name;
        return typeof name === 'string' ? { name } : undefined;
    }
});
export const auditUserUpdated = auditable<PatchUser>({
    resource: 'user',
    action: 'updated',
    scope: 'account',
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});

export const auditEnvironmentDeleted = auditable<DeleteEnvironment>({
    resource: 'environment',
    action: 'deleted',
    scope: 'environment',
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name)
});
export const auditEnvironmentUpdated = auditable<PatchEnvironment>({
    resource: 'environment',
    action: 'updated',
    scope: 'environment',
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name),
    metadata: (req) => {
        const meta: { name?: string; changedFields?: string[] } = {};
        const name = req.body.name;
        if (typeof name === 'string') {
            meta.name = name;
        }
        const fields = changedFields(req);
        if (fields) {
            meta.changedFields = fields;
        }
        return Object.keys(meta).length > 0 ? meta : undefined;
    }
});
export const auditEnvironmentVariablesChanged = auditable<PostEnvironmentVariables>({
    resource: 'environment',
    action: 'variables_changed',
    scope: 'environment',
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name),
    metadata: (req) => {
        const variables = req.body.variables;
        if (!Array.isArray(variables)) {
            return undefined;
        }
        const variableNames = variables
            .map((v) => (v && typeof v === 'object' ? (v as Record<string, unknown>)['name'] : undefined))
            .filter((n): n is string => typeof n === 'string');
        return { variableCount: variables.length, ...(variableNames.length > 0 ? { variableNames } : {}) };
    }
});
export const auditEnvironmentWebhookUrlsChanged = auditable<PatchWebhook>({
    resource: 'environment',
    action: 'webhook_urls_changed',
    scope: 'environment',
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name),
    metadata: (req) => {
        const meta: { primaryUrl?: string; secondaryUrl?: string } = {};
        const primaryUrl = safeUrl(req.body.primary_url);
        if (primaryUrl) {
            meta.primaryUrl = primaryUrl;
        }
        const secondaryUrl = safeUrl(req.body.secondary_url);
        if (secondaryUrl) {
            meta.secondaryUrl = secondaryUrl;
        }
        return Object.keys(meta).length > 0 ? meta : undefined;
    }
});

export const auditBillingPlanChanged = auditable<PostPlanChange>({
    resource: 'billing',
    action: 'plan_changed',
    scope: 'account',
    metadata: (req, locals) => {
        const meta: { fromPlan?: string; toPlan?: string } = {};
        const orbId = req.body.orbId;
        if (typeof orbId === 'string') {
            meta.toPlan = orbId;
        }
        if (locals.plan?.name) {
            meta.fromPlan = locals.plan.name;
        }
        return Object.keys(meta).length > 0 ? meta : undefined;
    }
});
export const auditBillingTrialExtended = auditable<PostPlanExtendTrial>({ resource: 'billing', action: 'trial_extended', scope: 'account' });
export const auditBillingDetailsChanged = auditable<PutBillingInvoicingDetails>({ resource: 'billing', action: 'details_changed', scope: 'account' });

export const auditAppAuthPasswordChanged = auditable<PutUserPassword>({
    resource: 'app_auth',
    action: 'password_changed',
    scope: 'account',
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});
