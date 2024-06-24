import { z } from 'zod';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PostDeployConfirmation } from '@nangohq/types';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getAndReconcileDifferences } from '@nangohq/shared';
import { getOrchestrator } from '../../../utils/utils.js';
import { logContextGetter } from '@nangohq/logs';

const orchestrator = getOrchestrator();

export const fileBody = z.object({ js: z.string(), ts: z.string() }).strict();
export const flowConfigs = z.array(
    z
        .object({
            type: z.enum(['action', 'sync']),
            models: z.array(z.string().min(1).max(255)),
            runs: z.string(),
            auto_start: z.boolean().optional().default(false),
            attributes: z.object({}).optional(),
            metadata: z
                .object({
                    scopes: z.array(z.string().max(255)).optional(),
                    description: z.string().max(2000).optional()
                })
                .strict()
                .optional(),
            model_schema: z.string(), // TODO: type that
            input: z.union([z.string().max(255), z.any()]).optional(),
            endpoints: z
                .array(
                    z
                        .object({
                            GET: z.string().optional(),
                            POST: z.string().optional(),
                            PATCH: z.string().optional(),
                            PUT: z.string().optional(),
                            DELETE: z.string().optional()
                        })
                        .strict()
                )
                .optional(),
            syncName: z.string(),
            providerConfigKey: z.string(),
            fileBody,
            version: z.string().optional(),
            track_deletes: z.boolean().optional().default(false),
            sync_type: z.enum(['incremental', 'full']).optional(),
            webhookSubscriptions: z.array(z.string().max(255)).optional()
        })
        .strict()
);
export const postConnectionScriptsByProvider = z.array(
    z
        .object({
            providerConfigKey: z.string().min(1).max(255),
            scripts: z.array(z.object({ name: z.string().min(1).max(255), fileBody }).strict())
        })
        .strict()
);

const validation = z
    .object({
        flowConfigs,
        postConnectionScriptsByProvider,
        reconcile: z.boolean(),
        debug: z.boolean(),
        singleDeployMode: z.boolean().optional().default(false)
    })
    .strict();

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

    const result = await getAndReconcileDifferences({
        environmentId,
        flows: body.flowConfigs,
        performAction: false,
        activityLogId: null,
        debug: body.debug,
        singleDeployMode: body.singleDeployMode,
        logContextGetter,
        orchestrator
    });
    if (!result) {
        res.status(500).send({ error: { code: 'server_error' } });
        return;
    }

    res.status(200).send(result);
});
