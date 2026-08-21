import * as z from 'zod';

import { productTracking } from '@nangohq/shared';
import { cliTelemetryEvents, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { PostCliTelemetry } from '@nangohq/types';

const bodySchema = z
    .object({
        deviceId: z.string().uuid(),
        event: z.enum(cliTelemetryEvents),
        ephemeral: z.boolean().optional()
    })
    .strict();

export const postCliTelemetry = asyncWrapper<PostCliTelemetry>((req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = bodySchema.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { deviceId, event, ephemeral } = val.data;
    productTracking.trackAnonymous({ name: event, distinctId: deviceId, ...(ephemeral ? { eventProperties: { 'device-id-ephemeral': true } } : {}) });

    res.status(204).send();
});
