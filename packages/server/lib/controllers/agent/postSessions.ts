import { z } from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import * as agentSessionConnectionsService from '../../services/agentSessionConnections.service.js';
import * as agentSessionCreationService from '../../services/agentSessionCreation.service.js';
import * as agentSessionToolsetService from '../../services/agentSessionToolset.service.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';

import type { AgentSessionCreationErrorPayload, PostAgentSessions } from '@nangohq/types';

const bodySchema = z.strictObject({
    tenant: z.strictObject({
        connections: agentSessionConnectionsService.agentSessionTenantConnectionsSchema
    }),
    toolset: agentSessionToolsetService.agentSessionToolsetSchema.optional(),
    pinned_tools: agentSessionToolsetService.agentSessionPinnedToolsSchema.optional(),
    meta_tools: z.record(z.string(), z.boolean()).optional(),
    expires_in: agentSessionCreationService.agentSessionExpiresInSchema.optional()
});

export const postAgentSessions = asyncWrapperWithEnvironment<PostAgentSessions>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }

    const { account, environment } = res.locals;
    const created = await agentSessionCreationService.createAgentSession({
        account,
        environment,
        connections: body.data.tenant.connections,
        toolset: body.data.toolset,
        pinnedTools: body.data.pinned_tools,
        metaTools: body.data.meta_tools,
        expiresInMs: body.data.expires_in
    });

    if (created.isErr()) {
        if (created.error.code === 'server_error') {
            res.status(500).send({ error: { code: 'server_error', message: created.error.message } });
            return;
        }

        res.status(400).send({
            error: {
                code: created.error.code,
                message: created.error.message,
                payload: created.error.payload as unknown as AgentSessionCreationErrorPayload
            }
        });
        return;
    }

    res.status(201).send({
        data: {
            session_id: created.value.session.id,
            session_token: created.value.token,
            mcp_url: created.value.mcpUrl,
            expires_at: created.value.session.expiresAt.toISOString(),
            toolset: created.value.toolset,
            meta_tools: created.value.metaTools
        }
    });
});
