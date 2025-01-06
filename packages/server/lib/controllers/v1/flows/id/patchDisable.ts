import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import type { PatchFlowDisable } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { flowConfig } from '../../../sync/deploy/validation.js';
import { configService, disableScriptConfig, errorNotificationService } from '@nangohq/shared';
import { providerConfigKeySchema, providerSchema, scriptNameSchema } from '../../../../helpers/validation.js';

export const validationBody = z
    .object({
        provider: providerSchema,
        providerConfigKey: providerConfigKeySchema,
        scriptName: scriptNameSchema,
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

    const config = await configService.getIdByProviderConfigKey(environment.id, body.providerConfigKey);
    if (!config) {
        res.status(400).send({ error: { code: 'unknown_provider' } });
        return;
    }

    const updated = await disableScriptConfig({ id: valParams.data.id, environmentId: environment.id });
    await errorNotificationService.sync.clearBySyncConfig({ sync_config_id: valParams.data.id });

    if (updated > 0) {
        res.status(200).send({ data: { success: true } });
    } else {
        res.status(400).send({ data: { success: false } });
    }
});
