import { changedFields, makeAuditTarget as makeTarget } from '../../audit.js';
import { Audit, auditable } from './auditable.js';
import { nonEmptyString, omitUndefined } from './input.js';
import { integrationProviderMeta, integrationTarget } from './lookups.js';

import type {
    DeleteIntegration,
    DeletePublicIntegration,
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
