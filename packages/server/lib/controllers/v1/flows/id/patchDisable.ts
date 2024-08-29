import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import type { PatchFlowDisable } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { flowConfig } from '../../../sync/deploy/postConfirmation.js';
import { configService, disableScriptConfig } from '@nangohq/shared';

export const validationBody = z
    .object({
        provider: z.string().min(1).max(255),
        providerConfigKey: z.string().min(1).max(255),
        scriptName: z.string().min(1).max(255),
        type: flowConfig.shape.type
    })
    .strict();
export const validationParams = z
    .object({
        id: z.coerce.number().positive()
    })
    .strict();

export const patchFlowDisable = asyncWrapper<PatchFlowDisable>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) }
        });
        return;
    }

    const val = validationBody.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const body: PatchFlowDisable['Body'] = val.data;
    const { environment } = res.locals;

    const config = await configService.getConfigIdByProviderConfigKey(body.providerConfigKey, environment.id);
    if (!config) {
        res.status(400).send({ error: { code: 'unknown_provider' } });
        return;
    }

    const updated = await disableScriptConfig({ id: valParams.data.id, environmentId: environment.id });

    if (updated > 0) {
        res.status(200).send({ data: { success: true } });
    } else {
        res.status(400).send({ data: { success: false } });
    }
});
