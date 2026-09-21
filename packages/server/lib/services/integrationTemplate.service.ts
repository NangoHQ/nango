import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';
import { accountService, configService, deployTemplate, deployTemplates, getPlan, productTracking, startTrial, syncManager } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import { getOrchestrator } from '../utils/utils.js';
import flowService from './flow.service.js';

import type { Config } from '@nangohq/shared';
import type { DBEnvironment, DBPlan, DBTeam, DBUser, IntegrationConfig, RunnableFunctionType, ScriptTypeLiteral, SyncDeploymentResult } from '@nangohq/types';

const orchestrator = getOrchestrator();

export type DeployIntegrationTemplateReason =
    | 'integration_not_found'
    | 'plan_limit'
    | 'template_not_found'
    | 'ambiguous_template'
    | 'template_already_deployed'
    | 'non_runnable_type'
    | 'failed_to_deploy';

export type DeployIntegrationTemplateOutcome =
    | { ok: true; result: SyncDeploymentResult; type: RunnableFunctionType }
    | { ok: false; reason: DeployIntegrationTemplateReason; cause?: Error };

/**
 * Deploys a catalog template onto an integration: resolves the template from the catalog (keyed by the
 * integration's own provider), deploys it, and triggers it for existing connections.
 */
export async function deployIntegrationTemplate({
    environment,
    account,
    plan,
    user,
    providerConfigKey,
    name,
    type
}: {
    environment: DBEnvironment;
    account: DBTeam;
    plan: DBPlan | null;
    user?: Pick<DBUser, 'id' | 'email' | 'name'> | undefined;
    providerConfigKey: string;
    name: string;
    type?: ScriptTypeLiteral | undefined;
}): Promise<DeployIntegrationTemplateOutcome> {
    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        return { ok: false, reason: 'integration_not_found' };
    }

    if (plan && plan.auto_idle && plan.trial_end_at && plan.trial_end_at.getTime() < Date.now()) {
        return { ok: false, reason: 'plan_limit' };
    }
    if (plan && !plan.trial_end_at && plan.auto_idle) {
        await startTrial(db.knex, plan);
        productTracking.track({ name: 'account:trial:started', team: account, user });
    }

    // When `type` is omitted, infer it from the catalog: a template name is almost always unique
    // across sync/action for a provider. Only flag ambiguity when the same name exists as both.
    const candidateTypes: ScriptTypeLiteral[] = type ? [type] : ['sync', 'action'];
    const matches = candidateTypes.flatMap((candidate) => {
        const found = flowService.getFlowByIntegrationAndName({ provider: integration.provider, type: candidate, scriptName: name });
        return found ? [{ type: candidate, template: found }] : [];
    });

    const [match, ...rest] = matches;
    if (!match) {
        return { ok: false, reason: 'template_not_found' };
    }
    if (rest.length > 0) {
        return { ok: false, reason: 'ambiguous_template' };
    }
    const { type: resolvedType, template } = match;
    if (resolvedType !== 'sync' && resolvedType !== 'action') {
        return { ok: false, reason: 'non_runnable_type', cause: new Error(`Template '${name}' resolved to non-runnable type '${resolvedType}'`) };
    }

    const logCtx = await logContextGetter.create({ operation: { type: 'deploy', action: 'prebuilt' } }, { account, environment });
    const resDeploy = await deployTemplate({
        environment,
        team: account,
        template,
        integration,
        deployInfo: { integrationId: providerConfigKey, provider: integration.provider },
        logCtx
    });
    if (resDeploy.isErr()) {
        // deployTemplate returns a NangoError whose `type` carries the failure code; read it structurally
        // rather than via `instanceof` (the class identity differs across the dist/src boundary in tests).
        const errType = (resDeploy.error as { type?: string }).type;
        const reason = errType === 'template_already_deployed' ? 'template_already_deployed' : 'failed_to_deploy';
        return { ok: false, reason, cause: resDeploy.error };
    }

    const deploy = resDeploy.value;
    await syncManager.triggerIfConnectionsExist({ flows: [deploy.result], environmentId: environment.id, logContextGetter, orchestrator });

    return { ok: true, result: deploy.result, type: resolvedType };
}

export type DeployCatalogActionsSkipReason = 'already_deployed' | 'missing_json_schema' | 'copy_failed';

export type DeployCatalogActionsResult =
    | { ok: true; deployed: string[]; skipped: { name: string; reason: DeployCatalogActionsSkipReason }[] }
    | { ok: false; reason: 'plan_limit' };

/**
 * Deploy every catalog action for an integration's provider. Used after integration create.
 * Syncs and on-events are not deployed. Failures are skipped, not thrown — create must still succeed.
 */
export async function deployCatalogActions({
    environment,
    account,
    plan,
    user,
    integration
}: {
    environment: DBEnvironment;
    account: DBTeam;
    plan: DBPlan | null;
    user?: Pick<DBUser, 'id' | 'email' | 'name'> | undefined;
    integration: Pick<Config, 'id' | 'unique_key' | 'provider'> | IntegrationConfig;
}): Promise<DeployCatalogActionsResult> {
    if (plan && plan.auto_idle && plan.trial_end_at && plan.trial_end_at.getTime() < Date.now()) {
        return { ok: false, reason: 'plan_limit' };
    }
    if (plan && !plan.trial_end_at && plan.auto_idle) {
        await startTrial(db.knex, plan);
        productTracking.track({ name: 'account:trial:started', team: account, user });
    }

    const catalog = flowService.getAllAvailableFlowsAsStandardConfig().find((entry) => entry.providerConfigKey === integration.provider);
    const actions = catalog?.actions ?? [];
    if (actions.length === 0) {
        return { ok: true, deployed: [], skipped: [] };
    }

    const logCtx = await logContextGetter.create({ operation: { type: 'deploy', action: 'prebuilt' } }, { account, environment });
    try {
        const { deployed, skipped } = await deployTemplates({
            environment,
            team: account,
            templates: actions,
            integration,
            deployInfo: { integrationId: integration.unique_key, provider: integration.provider },
            logCtx
        });

        if (deployed.length === 0 && skipped.some((item) => item.reason === 'copy_failed')) {
            await logCtx.failed();
        } else {
            await logCtx.success();
        }

        return { ok: true, deployed: deployed.map((item) => item.name), skipped };
    } catch (err) {
        await logCtx.failed();
        throw err;
    }
}

/**
 * Best-effort wrapper for create paths: loads account/plan when they are not already on the request,
 * and never throws — integration create must succeed even if catalog deploy fails.
 */
export async function autoDeployCatalogActions({
    environment,
    account,
    plan,
    user,
    integration
}: {
    environment: DBEnvironment;
    account?: DBTeam | null;
    plan?: DBPlan | null;
    user?: Pick<DBUser, 'id' | 'email' | 'name'> | undefined;
    integration: Pick<Config, 'id' | 'unique_key' | 'provider'> | IntegrationConfig;
}): Promise<void> {
    try {
        let resolvedAccount = account ?? null;
        if (!resolvedAccount) {
            resolvedAccount = await accountService.getAccountById(db.knex, environment.account_id);
        }
        if (!resolvedAccount) {
            report(new Error('auto_deploy_catalog_actions_missing_account'), { environmentId: environment.id, integrationId: integration.unique_key });
            return;
        }

        let resolvedPlan = plan ?? null;
        if (plan === undefined) {
            const planRes = await getPlan(db.knex, { accountId: resolvedAccount.id });
            resolvedPlan = planRes.isOk() ? planRes.value : null;
        }

        await deployCatalogActions({
            environment,
            account: resolvedAccount,
            plan: resolvedPlan,
            user,
            integration
        });
    } catch (err) {
        report(err, { environmentId: environment.id, integrationId: integration.unique_key });
    }
}
