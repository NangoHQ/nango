import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PostDeployConfirmation, ScriptDifferences } from '@nangohq/types';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getAndReconcileDifferences, onEventScriptService } from '@nangohq/shared';
import { getOrchestrator } from '../../../utils/utils.js';
import { logContextGetter } from '@nangohq/logs';
import { validation } from './validation.js';

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

    const body: PostDeployConfirmation['Body'] = val.data;
    const environmentId = res.locals['environment'].id;

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
            onEventScriptsByProvider: body.onEventScriptsByProvider
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
            deletedOnEventScripts: []
        };
    }

    res.status(200).send(result);
});
