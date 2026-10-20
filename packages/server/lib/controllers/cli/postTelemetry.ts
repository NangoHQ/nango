import * as z from 'zod';

import { productTracking } from '@nangohq/shared';
import { cliTelemetryCommands, legacyCliTelemetryEvents, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { LegacyCliTelemetryEvent, PostCliTelemetry } from '@nangohq/types';

const common = {
    deviceId: z.string().uuid(),
    ephemeral: z.boolean().optional()
};

const bodySchema = z.union([
    z.object({ ...common, command: z.enum(cliTelemetryCommands) }).strict(),
    z
        .object({ ...common, event: z.enum(Object.keys(legacyCliTelemetryEvents) as [LegacyCliTelemetryEvent, ...LegacyCliTelemetryEvent[]]) })
        .strict()
        .transform(({ event, ...rest }) => ({ ...rest, command: legacyCliTelemetryEvents[event] }))
]);

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

    const { deviceId, command, ephemeral } = val.data;
    productTracking.trackAnonymous({
        name: 'functions:command_start',
        distinctId: deviceId,
        eventProperties: { command, ...(ephemeral ? { is_device_ephemeral: true } : {}) }
    });

    res.status(204).send();
});
