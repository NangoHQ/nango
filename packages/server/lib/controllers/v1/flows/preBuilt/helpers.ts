import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';
import { configService, deployTemplate, flowService, productTracking, startTrial, syncManager } from '@nangohq/shared';

import { getOrchestrator } from '../../../../utils/utils.js';

import type { DBEnvironment, DBPlan, DBTeam, DBUser, RunnableFunctionType, ScriptTypeLiteral, SyncDeploymentResult } from '@nangohq/types';

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
 * integration's own provider), deploys it, and triggers it for existing connections. Shared by the private
 * `POST /api/v1/flows/pre-built/deploy` and the public `POST /integrations/:uniqueKey/functions` — each maps
 * the outcome to its own response shape.
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
    user: DBUser;
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
        return { ok: false, reason: 'non_runnable_type' };
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
