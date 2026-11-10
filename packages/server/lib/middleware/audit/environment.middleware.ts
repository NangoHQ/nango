import { changedFields, makeAuditTarget as makeTarget } from '../../audit.js';
import { Audit, auditable, maybeAuditable } from './auditable.js';
import { callerSubject, credentialsReadTargets, skipUnlessCredentialsRead } from './credentialsRead.js';
import { nonEmptyString, omitUndefined, param, query, uuid } from './input.js';
import { accountEnvironmentTarget, environmentFromUuid } from './lookups.js';

import type {
    DeleteEnvironment,
    DeletePublicEnvironment,
    EnvironmentUpdatedMetadata,
    GetPublicEnvironment,
    PatchEnvironment,
    PatchPublicEnvironment,
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

export const auditEnvironmentWebhooksUpdated = auditable<PatchWebhook>({
    policy: Audit.auditable({ resource: 'environment', action: 'updated', scope: 'environment' }),
    target: (_req, locals) => makeTarget('environment', locals.environment?.id, locals.environment?.name),
    metadata: (req) =>
        omitUndefined<EnvironmentUpdatedMetadata>({
            changedFields: changedFields(req.body)?.map((field) => `webhooks.${field}`),
            ...webhookMetadata(req.body)
        })
});

export const auditPublicEnvironmentUpdated = auditable<PatchPublicEnvironment>({
    policy: Audit.auditable({ resource: 'environment', action: 'updated', scope: 'environment' }),
    environment: (req, locals) => environmentFromUuid(req.params.environmentUuid, locals),
    target: (req, locals) => accountEnvironmentTarget(req.params.environmentUuid, locals),
    metadata: (req) => {
        const body = req.body;
        const webhooks = body && typeof body.webhooks === 'object' && !Array.isArray(body.webhooks) ? body.webhooks : undefined;
        const fields = changedFields(body)?.flatMap((field) =>
            field === 'webhooks' && webhooks ? (changedFields(webhooks)?.map((key) => `webhooks.${key}`) ?? []) : [field]
        );
        return omitUndefined<EnvironmentUpdatedMetadata>({
            name: nonEmptyString(body?.name),
            changedFields: fields?.length ? fields : undefined,
            ...webhookMetadata(webhooks)
        });
    }
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

export const auditPublicEnvironmentCredentialsRead = maybeAuditable<GetPublicEnvironment>({
    policy: Audit.auditable({ resource: 'environment', action: 'credentials_read', scope: 'environment' }),
    skipWhen: skipUnlessCredentialsRead((req) => query(req, 'with_secrets') === 'true'),
    subject: callerSubject,
    atFinish: (req) => credentialsReadTargets('environment', req, uuid(param(req, 'environmentUuid')))
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

function webhookMetadata(value: unknown): Pick<EnvironmentUpdatedMetadata, 'primaryUrl' | 'secondaryUrl'> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const fields = value as Record<string, unknown>;
    return omitUndefined({
        primaryUrl: fields['primary_url'] === null || fields['primary_url'] === '' ? null : safeUrl(fields['primary_url']),
        secondaryUrl: fields['secondary_url'] === null || fields['secondary_url'] === '' ? null : safeUrl(fields['secondary_url'])
    });
}
