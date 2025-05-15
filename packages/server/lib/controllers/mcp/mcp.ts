import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import { connectionService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { createMcpServerForConnection } from './server.js';
import { connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { GetMcp, PostMcp } from '@nangohq/types';

export const validationHeaders = z
    .object({
        'connection-id': connectionIdSchema,
        'provider-config-key': providerConfigKeySchema
    })
    .strict();

export const postMcp = asyncWrapper<PostMcp>(async (req, res) => {
    const valHeaders = validationHeaders.safeParse({ 'connection-id': req.get('connection-id'), 'provider-config-key': req.get('provider-config-key') });
    if (!valHeaders.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(valHeaders.error) } });
        return;
    }

    const { environment, account } = res.locals;
    const headers: PostMcp['Headers'] = valHeaders.data;

    const connectionId = headers['connection-id'];
    const providerConfigKey = headers['provider-config-key'];

    const { error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);

    if (error || !connection) {
        res.status(400).send({
            error: { code: 'unknown_connection', message: 'Provided connection-id and provider-config-key does not match a valid connection' }
        });
        return;
    }

    const result = await createMcpServerForConnection(account, environment, connection, providerConfigKey);
    if (result.isErr()) {
        res.status(500).send({ error: { code: 'Internal server error', message: result.error.message } });
        return;
    }

    const server = result.value;
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
    });

    res.on('close', () => {
        void transport.close();
        void server.close();
    });

    // Casting because 'exactOptionalPropertyTypes: true' says `?: string` is not equal to `string | undefined`
    await server.connect(transport as Transport);
    await transport.handleRequest(req, res, req.body);
});

// We have to be explicit about not supporting SSE
export const getMcp = asyncWrapper<GetMcp>((_, res) => {
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.'
            },
            id: null
        })
    );
});
