import * as z from 'zod';

import { configService, getSyncConfigsAsStandardConfig, onEventScriptService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { toNangoFunctionDeployed, toNangoFunctionDeployedFromOnEvent } from '../../../../../formatters/function.js';
import { envSchema } from '../../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { validationParams } from '../getIntegration.js';

import type { GetIntegrationFunctions, NangoFunctionDeployed } from '@nangohq/types';

const querystringValidation = z
    .object({
        env: envSchema,
        type: z.enum(['sync', 'action', 'on-event']).optional(),
        page: z.coerce.number().int().min(0).optional().default(0),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20)
    })
    .strict();

export const getIntegrationFunctions = asyncWrapper<GetIntegrationFunctions>(async (req, res) => {
    const queryStringValues = querystringValidation.safeParse(req.query);
    if (!queryStringValues.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringValues.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const { providerConfigKey } = valParams.data;
    const { type, page, limit } = queryStringValues.data;

    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const wantsSyncOrAction = type === 'sync' || type === 'action' || type === undefined;
    const wantsOnEvent = type === 'on-event' || type === undefined;

    const combined: NangoFunctionDeployed[] = [];

    if (wantsSyncOrAction) {
        const deployed = await getSyncConfigsAsStandardConfig(environment.id, providerConfigKey);
        if (type !== 'action') {
            for (const sync of deployed?.syncs ?? []) {
                combined.push(toNangoFunctionDeployed(sync));
            }
        }
        if (type !== 'sync') {
            for (const action of deployed?.actions ?? []) {
                combined.push(toNangoFunctionDeployed(action));
            }
        }
    }

    if (wantsOnEvent) {
        const onEventScripts = await onEventScriptService.getByEnvironmentId(environment.id);
        for (const script of onEventScripts) {
            if (script.providerConfigKey === providerConfigKey) {
                combined.push(toNangoFunctionDeployedFromOnEvent(script));
            }
        }
    }

    combined.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

    const total = combined.length;
    const data = combined.slice(page * limit, (page + 1) * limit);

    res.status(200).send({ data, pagination: { total, page, limit } });
});
