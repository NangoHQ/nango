import { logContextGetter } from '@nangohq/logs';
import { getAndReconcileDifferences, onEventScriptService } from '@nangohq/shared';
import { metrics, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { validation } from './validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../utils/utils.js';

import type { PostDeployConfirmation, ScriptDifferences } from '@nangohq/types';

const orchestrator = getOrchestrator();

export const postDeployConfirmation = asyncWrapper<PostDeployConfirmation>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { account } = res.locals;
    const body: PostDeployConfirmation['Body'] = val.data;
    const environmentId = res.locals['environment'].id;

    metrics.increment(metrics.Types.DEPLOY_INCOMING_PAYLOAD_SIZE, req.rawBody?.length || 0, { accountId: account.id });

    const syncAndActionDifferences = await getAndReconcileDifferences({
        environmentId,
        flows: body.flowConfigs,
        performAction: false,
        debug: body.debug,
        singleDeployMode: body.singleDeployMode,
        logContextGetter,
        orchestrator
    });
    if (!syncAndActionDifferences) {
        res.status(500).send({ error: { code: 'server_error' } });
        return;
    }

    let result: ScriptDifferences;
    if (body.onEventScriptsByProvider) {
        const diff = await onEventScriptService.diffChanges({
            environmentId,
            onEventScriptsByProvider: body.onEventScriptsByProvider,
            singleDeployMode: body.singleDeployMode || false,
            sdkVersion: body.sdkVersion
        });
        result = {
            ...syncAndActionDifferences,
            newOnEventScripts: diff.added.map((script) => {
                return {
                    providerConfigKey: script.providerConfigKey,
                    name: script.name,
                    event: script.event
                };
            }),
            updatedOnEventScripts: diff.updated.map((script) => {
                return {
                    providerConfigKey: script.providerConfigKey,
                    name: script.name,
                    event: script.event
                };
            }),
            deletedOnEventScripts: diff.deleted.map((script) => {
                return {
                    providerConfigKey: script.providerConfigKey,
                    name: script.name,
                    event: script.event
                };
            })
        };
    } else {
        result = {
            ...syncAndActionDifferences,
            newOnEventScripts: [],
            updatedOnEventScripts: [],
            deletedOnEventScripts: []
        };
    }

    res.status(200).send(result);
});
