import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { UpdateMetadata, Metadata, MetadataBody } from '@nangohq/types';
import { connectionService } from '@nangohq/shared';
import { connectionIdSchema, providerConfigKeySchema } from '../../../../helpers/validation.js';
import type { Response } from 'express';

const validation = z
    .object({
        connection_id: z.union([connectionIdSchema, z.array(connectionIdSchema)]),
        provider_config_key: providerConfigKeySchema,
        metadata: z.record(z.unknown())
    })
    .strict();

export const patchPublicMetadata = asyncWrapper<UpdateMetadata>(async (req, res) => {
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

    const { environment } = res.locals;
    const { connectionIds, providerConfigKey, metadata } = parseBody(val.data);

    await updateByConnectionId(res, connectionIds, providerConfigKey, environment.id, metadata);
    res.status(200).send(req.body);
});

function parseBody(body: MetadataBody) {
    const { connection_id: connectionIdArg, provider_config_key: providerConfigKey, metadata } = body;

    return {
        connectionIds: bodyParamToArray(connectionIdArg),
        providerConfigKey,
        metadata
    };
}

function bodyParamToArray(param: string | string[] | undefined): string[] {
    if (Array.isArray(param)) {
        return param;
    }

    return param ? [param] : [];
}

async function updateByConnectionId(res: Response, connectionIds: string[], providerConfigKey: string, environmentId: number, metadata: Metadata) {
    const storedConnections = await connectionService.getConnectionsByConnectionIds(connectionIds, providerConfigKey, environmentId);
    if (storedConnections.length !== connectionIds.length) {
        const unknownIds = connectionIds.filter((connectionId) => !storedConnections.find((conn) => conn.connection_id === connectionId));
        res.status(404).send({
            error: {
                code: 'unknown_connection',
                message: `Connection with connection ids: ${unknownIds.join(', ')} and provider config key ${providerConfigKey} not found. Please make sure the connection exists in the Nango dashboard. No actions were taken on any of the connections as a result of this failure.`
            }
        });
        return;
    }

    await connectionService.updateMetadata(storedConnections, metadata);
}
