import { makeAuditTarget as makeTarget } from '../../audit.js';
import { Audit, auditable } from './auditable.js';
import { nonEmptyString, omitUndefined } from './input.js';
import { accountApiKeyTarget, apiKeyTarget, environmentFromUuid, publicEnvApiKeyTarget } from './lookups.js';

import type { CreateAccountApiKey, CreateApiKey, DeleteAccountApiKey, DeleteApiKey, DeletePublicApiKey, PatchApiKey, PostPublicApiKey } from '@nangohq/types';

export const auditApiKeyCreated = auditable<CreateApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'created', scope: 'environment' }),
    // Never read the secret from the response — only the id and display name identify the key.
    targetFromResponse: (response) => makeTarget('api_key', response.data.uuid, response.data.display_name),
    metadata: (req) => omitUndefined({ displayName: nonEmptyString(req.body.display_name) }),
    metadataFromResponse: (response) => omitUndefined({ scopes: response.data.scopes })
});

export const auditPublicApiKeyCreated = auditable<PostPublicApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'created', scope: 'environment' }),
    environment: (req, locals) => environmentFromUuid(req.params.environmentUuid, locals),
    targetFromResponse: (response) => makeTarget('api_key', response.data.uuid, response.data.display_name),
    metadata: (req) => omitUndefined({ displayName: nonEmptyString(req.body.display_name) }),
    metadataFromResponse: (response) => omitUndefined({ scopes: response.data.scopes })
});

export const auditAccountApiKeyCreated = auditable<CreateAccountApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'created', scope: 'account' }),
    targetFromResponse: (response) => makeTarget('api_key', response.data.uuid, response.data.display_name),
    metadata: (req) => omitUndefined({ displayName: nonEmptyString(req.body.display_name) }),
    // Scopes are chosen by the service/controller today and will be request-configurable later —
    // always record what was actually persisted.
    metadataFromResponse: (response) => omitUndefined({ scopes: response.data.scopes })
});

export const auditApiKeyUpdated = auditable<PatchApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'updated', scope: 'environment' }),
    target: (req, locals) => apiKeyTarget(req.params.keyId, locals),
    metadata: (req) =>
        omitUndefined({
            displayName: nonEmptyString(req.body.display_name),
            scopes: Array.isArray(req.body.scopes) ? req.body.scopes.filter((s) => typeof s === 'string') : undefined
        })
});

export const auditApiKeyDeleted = auditable<DeleteApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'deleted', scope: 'environment' }),
    target: (req, locals) => apiKeyTarget(req.params.keyId, locals)
});

export const auditPublicApiKeyDeleted = auditable<DeletePublicApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'deleted', scope: 'environment' }),
    environment: (req, locals) => environmentFromUuid(req.params.environmentUuid, locals),
    target: (req, locals) => publicEnvApiKeyTarget(req.params.keyUuid, req.params.environmentUuid, locals)
});

export const auditAccountApiKeyDeleted = auditable<DeleteAccountApiKey>({
    policy: Audit.auditable({ resource: 'api_key', action: 'deleted', scope: 'account' }),
    target: (req, locals) => accountApiKeyTarget(req.params.keyId, locals)
});
