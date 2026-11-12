import { changedFields, makeAuditTarget as makeTarget } from '../../audit.js';
import { Audit, auditable, maybeAuditable } from './auditable.js';
import { callerSubject, credentialsReadTargets, skipUnlessCredentialsRead } from './credentialsRead.js';
import { nonEmptyString, omitUndefined, param, query } from './input.js';
import { integrationProviderMeta, integrationTarget } from './lookups.js';

import type {
    AuditPolicy,
    DeleteIntegration,
    DeletePublicIntegration,
    Endpoint,
    GetIntegration,
    GetPublicIntegration,
    PatchIntegration,
    PatchPublicIntegration,
    PostIntegration,
    PostPublicIntegration,
    PostPublicQuickstartIntegration
} from '@nangohq/types';

export const auditIntegrationCreated = auditable<PostIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'created', scope: 'environment' }),
    // The final unique_key is only certain in the response — the private path omits it from the request.
    targetFromResponse: (response) => makeTarget('integration', response.data.unique_key, response.data.display_name ?? undefined),
    metadata: (req) => omitUndefined({ provider: nonEmptyString(req.body.provider) })
});

export const auditPublicIntegrationCreated = auditable<PostPublicIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'created', scope: 'environment' }),
    targetFromResponse: (response) => makeTarget('integration', response.data.unique_key, response.data.display_name ?? undefined),
    metadata: (req) => omitUndefined({ provider: nonEmptyString(req.body.provider) })
});

export const auditPublicQuickstartIntegrationCreated = auditable<PostPublicQuickstartIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'created', scope: 'environment' }),
    targetFromResponse: (response) => makeTarget('integration', response.data.unique_key, response.data.display_name ?? undefined),
    metadata: (req) => omitUndefined({ provider: nonEmptyString(req.body.provider) })
});

export const auditIntegrationUpdated = auditable<PatchIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'updated', scope: 'environment' }),
    target: (req, locals) => integrationTarget(req.params.providerConfigKey, locals),
    metadata: async (req, locals) =>
        omitUndefined({ ...(await integrationProviderMeta(req.params.providerConfigKey, locals)), changedFields: changedFields(req.body) })
});

export const auditPublicIntegrationUpdated = auditable<PatchPublicIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'updated', scope: 'environment' }),
    target: (req, locals) => integrationTarget(req.params.uniqueKey, locals),
    metadata: async (req, locals) => omitUndefined({ ...(await integrationProviderMeta(req.params.uniqueKey, locals)), changedFields: changedFields(req.body) })
});

export const auditIntegrationDeleted = auditable<DeleteIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'deleted', scope: 'environment' }),
    target: (req, locals) => integrationTarget(req.params.providerConfigKey, locals),
    metadata: (req, locals) => integrationProviderMeta(req.params.providerConfigKey, locals)
});

export const auditPublicIntegrationDeleted = auditable<DeletePublicIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'deleted', scope: 'environment' }),
    target: (req, locals) => integrationTarget(req.params.uniqueKey, locals),
    metadata: (req, locals) => integrationProviderMeta(req.params.uniqueKey, locals)
});

export const auditIntegrationCredentialsRead = maybeAuditable<GetIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'credentials_read', scope: 'environment' }),
    skipWhen: skipUnlessCredentialsRead(),
    subject: callerSubject,
    atFinish: (req) => credentialsReadTargets('integration', req)
});

export const auditPublicIntegrationCredentialsRead = maybeAuditable<GetPublicIntegration>({
    policy: Audit.auditable({ resource: 'integration', action: 'credentials_read', scope: 'environment' }),
    skipWhen: skipUnlessCredentialsRead((req) => {
        const include = query(req, 'include');
        return include === 'credentials' || (Array.isArray(include) && include.includes('credentials'));
    }),
    subject: callerSubject,
    atFinish: (req) => credentialsReadTargets('integration', req, param(req, 'uniqueKey'))
});

// The deprecated GET /config/:providerConfigKey has no typed endpoint.
type GetDeprecatedProviderConfig = Endpoint<{
    Method: 'GET';
    Path: '/config/:providerConfigKey';
    Params: { providerConfigKey: string };
    Querystring: { include_creds?: string };
    Success: Record<string, any>;
}> & { Audit: AuditPolicy<'integration', 'credentials_read', 'environment'> };

export const auditDeprecatedProviderConfigCredentialsRead = maybeAuditable<GetDeprecatedProviderConfig>({
    policy: Audit.auditable({ resource: 'integration', action: 'credentials_read', scope: 'environment' }),
    skipWhen: skipUnlessCredentialsRead((req) => query(req, 'include_creds') === 'true'),
    subject: callerSubject,
    atFinish: (req) => credentialsReadTargets('integration', req, param(req, 'providerConfigKey'))
});
