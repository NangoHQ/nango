import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { parseQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { ApiError, UpdateMetadata, MetadataBody } from '@nangohq/types';
import { connectionService } from '@nangohq/shared';
import type { Connection } from '@nangohq/shared';

const validation = z
    .object({
        connection_id: z.union([z.string().min(1), z.array(z.string().min(1))]),
        provider_config_key: z.string().min(1),
        metadata: z.record(z.unknown())
    })
    .strict();

export const updateMetadata = asyncWrapper<UpdateMetadata>(async (req, res) => {
    const query = parseQuery(req);
    if (query) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
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

    const body: Required<MetadataBody> = val.data;

    const { connection_id: connectionIdArg, provider_config_key: providerConfigKey, metadata } = body;

    const connectionIds = Array.isArray(connectionIdArg) ? connectionIdArg : [connectionIdArg];

    const validConnections: Connection[] = [];

    for (const connectionId of connectionIds) {
        const { success, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);

        if (!success || !connection || !connection.id) {
            const baseMessage = `Connection with connection id ${connectionId} and provider config key ${providerConfigKey} not found. Please make sure the connection exists in the Nango dashboard`;
            const error: ApiError<'unknown_connection'> =
                connectionIds.length > 1
                    ? {
                          error: {
                              code: 'unknown_connection',
                              message: `${baseMessage}. No actions were taken on any of the connections as a result of this failure.`
                          }
                      }
                    : {
                          error: {
                              code: 'unknown_connection',
                              message: baseMessage
                          }
                      };
            res.status(404).json(error);

            return;
        }

        validConnections.push(connection);
    }

    await connectionService.updateMetadata(validConnections, metadata);

    res.status(200).send(req.body);
});
