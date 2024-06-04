import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { getAndReconcileDifferences } from '@nangohq/shared';
import { logContextGetter } from '@nangohq/logs';
import type { DeployConfirmation } from '@nangohq/types';

const validation = z
    .object({
        flowConfigs: z.array(
            z.object({
                syncName: z.string().min(1),
                providerConfigKey: z.string().min(1),
                fileBody: z.object({
                    js: z.string().min(1),
                    ts: z.string().min(1)
                }),
                version: z.string().min(1),
                track_deletes: z.boolean(),
                sync_type: z.enum(['sync', 'action']),
                webhookSubscriptions: z.array(z.string())
            })
        ),
        reconcile: z.boolean(),
        debug: z.boolean(),
        singleDeployMode: z.boolean().optional()
    })
    .strict();

export const confirmation = asyncWrapper<DeployConfirmation>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);

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

    const { flowConfigs, debug, singleDeployMode } = val;

    const environmentId = res.locals['environment'].id;

    const result = await getAndReconcileDifferences({
        environmentId,
        flows: flowConfigs,
        performAction: false,
        activityLogId: null,
        debug,
        singleDeployMode,
        logContextGetter
    });

    res.send(result!);
});
