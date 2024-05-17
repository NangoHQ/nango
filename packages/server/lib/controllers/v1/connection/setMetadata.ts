import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '../../../utils/validation.js';
import type { ApiError, SetMetadata, MetadataBody } from '@nangohq/types';
import { connectionService } from '@nangohq/shared';

const validation = z
    .object({
        connection_id: z.union([z.string().min(1), z.array(z.string().min(1))]),
        provider_config_key: z.string().min(1),
        metadata: z.record(z.unknown())
    })
    .strict();

export const setMetadata = asyncWrapper<SetMetadata>(async (req, res) => {
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

    const body: Required<MetadataBody> = val.data;

    const { connection_id: connectionIdArg, provider_config_key: providerConfigKey, metadata } = body;

    const connectionIds = Array.isArray(connectionIdArg) ? connectionIdArg : [connectionIdArg];

    const ids: number[] = [];

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

        ids.push(connection.id);
    }

    await connectionService.replaceMetadata(ids, metadata);

    res.status(201).send(req.body);
});
