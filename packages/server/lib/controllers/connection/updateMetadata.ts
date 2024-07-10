import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { zodErrorToHTTP } from '@nangohq/utils';
import type { ApiError, UpdateMetadata, MetadataBody, ConnectionConfig } from '@nangohq/types';
import { connectionService } from '@nangohq/shared';
import type { Connection } from '@nangohq/shared';
import db from '@nangohq/database';

const validation = z
    .object({
        connection_id: z.union([z.string().min(1), z.array(z.string().min(1))]),
        provider_config_key: z.string().min(1),
        metadata: z.record(z.unknown()).optional(),
        display_name: z.string().optional(),
        customer_domain: z.string().optional(),
        customer_email: z.string().optional(),
        env: z.record(z.unknown()).optional()
    })
    .strict();

export const updateMetadata = asyncWrapper<UpdateMetadata>(async (req, res) => {
    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const { environment } = res.locals;

    const body: MetadataBody = val.data as MetadataBody;

    const {
        connection_id: connectionIdArg,
        provider_config_key: providerConfigKey,
        metadata,
        display_name: displayName,
        customer_email: customerEmail,
        customer_domain: customerDomain
    } = body;

    const connectionConfig: Partial<ConnectionConfig> = {
        display_name: displayName,
        customer_email: customerEmail,
        customer_domain: customerDomain
    };

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

    await db.knex.transaction(async (trx) => {
        if (metadata) {
            await connectionService.updateMetadata(validConnections, metadata, trx);
        }

        for (const connection of validConnections) {
            await connectionService.updateConnectionConfig(connection, connectionConfig, trx);
        }
    });

    res.status(200).send(req.body);
});
