import { makeAuditTarget as makeTarget } from '../../audit.js';
import { Audit, auditable, maybeAuditable } from './auditable.js';
import { nonEmptyString, omitUndefined } from './input.js';

import type { AuditTarget } from '@nangohq/audit';
import type {
    DeleteIntegrationFunction,
    DeletePublicIntegrationFunction,
    PostDeploy,
    PostFunctionDeployment,
    PostFunctionDeploymentBundle,
    PostPreBuiltDeploy,
    PutUpgradePreBuiltFlow
} from '@nangohq/types';

// A code deploy is performed by the sandbox's CLI and recorded when that reaches /sync/deploy.
export const auditFunctionDeployedFromTemplate = maybeAuditable<PostFunctionDeployment>({
    policy: Audit.auditable({ resource: 'function', action: 'deployed', scope: 'environment' }),
    skipWhen: (req) => req.body.type !== 'template',
    subject: (_req, locals) => (locals.account ? { account: locals.account, environment: locals.environment } : undefined),
    atFinish: (req) => ({
        target: makeTarget('function', functionTargetId(req.body.integration_id, req.body.type === 'template' ? req.body.template : undefined)),
        metadata: omitUndefined({ source: 'catalog', type: nonEmptyString(req.body.function_type) })
    })
});

export const auditFunctionDeployedCli = auditable<PostDeploy>({
    policy: Audit.auditable({ resource: 'function', action: 'deployed', scope: 'environment' }),
    metadata: (req) => omitUndefined({ source: nonEmptyString(req.body.source) ?? 'repo' }),
    target: (req) =>
        Array.isArray(req.body.flowConfigs)
            ? req.body.flowConfigs
                  .map((flow) => makeTarget('function', functionTargetId(flow.providerConfigKey, flow.syncName)))
                  .filter((t): t is AuditTarget => Boolean(t))
            : undefined
});

export const auditFunctionDeploymentBundle = auditable<PostFunctionDeploymentBundle>({
    policy: Audit.auditable({ resource: 'function', action: 'deployed', scope: 'environment' }),
    target: (req) => functionBundleTargets(req.body.functions),
    metadata: () => ({ type: 'function' })
});

export const auditPreBuiltDeployed = auditable<PostPreBuiltDeploy>({
    policy: Audit.auditable({ resource: 'function', action: 'deployed', scope: 'environment' }),
    target: (req) => makeTarget('function', functionTargetId(req.body.providerConfigKey, req.body.scriptName)),
    metadata: (req) => omitUndefined({ source: 'catalog', type: nonEmptyString(req.body.type) })
});

export const auditFunctionUpgraded = auditable<PutUpgradePreBuiltFlow>({
    policy: Audit.auditable({ resource: 'function', action: 'upgraded', scope: 'environment' }),
    target: (req) => makeTarget('function', functionTargetId(req.body.providerConfigKey, req.body.scriptName)),
    metadata: (req) => omitUndefined({ upgradeVersion: nonEmptyString(req.body.upgradeVersion) })
});

export const auditFunctionDeleted = auditable<DeleteIntegrationFunction>({
    policy: Audit.auditable({ resource: 'function', action: 'deleted', scope: 'environment' }),
    target: (req) => makeTarget('function', functionTargetId(req.params.providerConfigKey, req.params.functionName)),
    metadata: (req) => functionDeletedMeta(req.query.type)
});

export const auditPublicFunctionDeleted = auditable<DeletePublicIntegrationFunction>({
    policy: Audit.auditable({ resource: 'function', action: 'deleted', scope: 'environment' }),
    target: (req) => makeTarget('function', functionTargetId(req.params.uniqueKey, req.params.name)),
    metadata: (req) => functionDeletedMeta(req.query.type)
});

function functionDeletedMeta(type: unknown): Record<string, unknown> | undefined {
    // A sync and an action can share a name; `type` disambiguates which function was deleted.
    return omitUndefined({ type: nonEmptyString(type) });
}

function functionTargetId(integrationId: unknown, name: unknown): string | undefined {
    const integration = nonEmptyString(integrationId);
    const functionName = nonEmptyString(name);
    return integration && functionName ? `${integration}:${functionName}` : functionName;
}

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
            return makeTarget('function', functionTargetId(integrationId, name));
        })
        .filter((target): target is AuditTarget => Boolean(target));
}
