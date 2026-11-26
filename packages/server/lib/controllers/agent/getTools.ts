import { z } from 'zod';

import { report, requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';

import * as agentSessionConnectionsService from '../../services/agentSessionConnections.service.js';
import * as agentSessionMcpDiscoveryService from '../../services/agentSessionMcpDiscovery.service.js';
import { buildSessionTools, TOOLS_PAGE_SIZE, withActionInputSchemas } from '../../services/agentSessionToolCatalog.service/index.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';

import type { GetAgentSessionTools } from '@nangohq/types';

const paramsSchema = z.strictObject({ sessionId: z.string().uuid() });
const querySchema = z.strictObject({
    cursor: z
        .string()
        .min(1)
        .max(255)
        .regex(/^[A-Za-z0-9_-]+$/)
        .transform((cursor, ctx) => {
            const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
            const offset = Number(decoded);
            if (!/^\d+$/.test(decoded) || !Number.isSafeInteger(offset)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor' });
                return z.NEVER;
            }
            return offset;
        })
        .optional()
});

export const getAgentSessionTools = asyncWrapperWithEnvironment<GetAgentSessionTools>(async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }

    const { account, environment, plan, agentSession } = res.locals;
    if (params.data.sessionId !== agentSession.id) {
        res.status(404).send({ error: { code: 'session_not_found', message: `Agent session '${params.data.sessionId}' not found` } });
        return;
    }

    const query = querySchema.safeParse(req.query);
    if (!query.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
        return;
    }

    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const session = agentSessionMcpDiscoveryService.hasPendingMcpServers(agentSession)
        ? await agentSessionConnectionsService
              .withConnectionsCreatedInSession(agentSession)
              .then(async (current) => await agentSessionMcpDiscoveryService.withMcpToolsDiscovered({ account, environment, plan, session: current }))
              .catch((err: unknown) => {
                  report(err);
                  return agentSession;
              })
        : agentSession;

    const { listed, actions } = buildSessionTools(session);
    const offset = query.data.cursor ?? 0;
    const page = listed.slice(offset, offset + TOOLS_PAGE_SIZE);
    const next = offset + page.length;
    const tools = await withActionInputSchemas({ page, actions, environmentId: session.environmentId });

    res.status(200).send({ tools, ...(next < listed.length ? { next_cursor: Buffer.from(String(next), 'utf8').toString('base64url') } : {}) });
});
