import { changedFields, makeAuditTarget as makeTarget } from '../../audit.js';
import { Audit, auditable } from './auditable.js';
import { nonEmptyString, omitUndefined } from './input.js';
import { accountEnvironmentTarget } from './lookups.js';

import type {
    DeleteEnvironment,
    DeletePublicEnvironment,
    PatchEnvironment,
    PatchWebhook,
    PostEnvironment,
    PostEnvironmentVariables,
    PostPublicEnvironment,
    PostPublicRotateWebhookSigningKey,
    PostRotateWebhookSigningKey
} from '@nangohq/types';

export const auditEnvironmentCreated = auditable<PostEnvironment>({
    policy: Audit.auditable({ resource: 'environment', action: 'created', scope: 'account' }),
    targetFromResponse: (response) => makeTarget('environment', response.data.id, response.data.name),
    metadata: (req) => omitUndefined({ name: nonEmptyString(req.body.name) })
});

export const auditPublicEnvironmentCreated = auditable<PostPublicEnvironment>({
    policy: Audit.auditable({ resource: 'environment', action: 'created', scope: 'account' }),
    targetFromResponse: (response) => makeTarget('environment', response.data.uuid, response.data.name),
    metadata: (req) => omitUndefined({ name: nonEmptyString(req.body.name) })
});

export const auditEnvironmentUpdated = auditable<PatchEnvironment>({
    policy: Audit.auditable({ resource: 'environment', action: 'updated', scope: 'environment' }),
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name),
    metadata: (req) =>
        omitUndefined({
            name: nonEmptyString(req.body.name),
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
            .map((v) => (v && typeof v === 'object' ? nonEmptyString((v as Record<string, unknown>)['name']) : undefined))
            .filter((n): n is string => n !== undefined);
        return omitUndefined({ variableCount: variables.length, variableNames: variableNames.length > 0 ? variableNames : undefined });
    }
});

export const auditEnvironmentWebhookUrlsChanged = auditable<PatchWebhook>({
    policy: Audit.auditable({ resource: 'environment', action: 'webhook_urls_changed', scope: 'environment' }),
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name),
    metadata: (req) =>
        omitUndefined({
            changedFields: changedFields(req.body),
            primaryUrl: safeUrl(req.body.primary_url),
            secondaryUrl: safeUrl(req.body.secondary_url)
        })
});

export const auditWebhookSigningKeyRotated = auditable<PostRotateWebhookSigningKey>({
    policy: Audit.auditable({ resource: 'environment', action: 'webhook_signing_key_rotated', scope: 'environment' }),
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name)
});

export const auditPublicWebhookSigningKeyRotated = auditable<PostPublicRotateWebhookSigningKey>({
    policy: Audit.auditable({ resource: 'environment', action: 'webhook_signing_key_rotated', scope: 'environment' }),
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name)
});

export const auditEnvironmentDeleted = auditable<DeleteEnvironment>({
    policy: Audit.auditable({ resource: 'environment', action: 'deleted', scope: 'environment' }),
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name)
});

export const auditPublicEnvironmentDeleted = auditable<DeletePublicEnvironment>({
    policy: Audit.auditable({ resource: 'environment', action: 'deleted', scope: 'account' }),
    target: (req, locals) => accountEnvironmentTarget(req.params.environmentUuid, locals)
});

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
