import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import type { UpgradePreBuiltFlow, IncomingFlowConfigUpgrade } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { flowConfig } from '../../../sync/deploy/postConfirmation.js';
import { logContextGetter } from '@nangohq/logs';
import { upgradePreBuilt as upgradePrebuiltFlow } from '@nangohq/shared';

const validation = flowConfig.extend({
    id: z.string(),
    upgrade_version: z.string(),
    last_deployed: z.string(),
    is_public: z.boolean(),
    pre_built: z.boolean()
});

export const upgradePreBuilt = asyncWrapper<UpgradePreBuiltFlow>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);

    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const flowConfig: IncomingFlowConfigUpgrade = val.data as IncomingFlowConfigUpgrade;
    const { environment, account } = res.locals;

    const result = await upgradePrebuiltFlow({
        environment,
        account,
        flowConfig,
        logContextGetter
    });

    if (result.isOk()) {
        res.send({ success: true });
        return;
    }

    res.status(400).send({ error: { code: 'upgrade_failed', message: result.error.message } });
});
