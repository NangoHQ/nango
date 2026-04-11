import { z } from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { getSessionByToken, subscribeToSession } from '../../../../../services/agent/agent-session.service.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';

import type { GetAgentSessionEvents } from '@nangohq/types';

const paramsSchema = z
    .object({
        sessionToken: z.string().min(1)
    })
    .strict();

const heartbeatIntervalMs = 15_000;

export const getAgentSessionEvents = asyncWrapper<GetAgentSessionEvents>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = paramsSchema.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { sessionToken } = valParams.data;
    const { environment } = res.locals;

    const session = await getSessionByToken(sessionToken, environment.id);
    if (!session) {
        res.status(404).send({ error: { code: 'not_found', message: 'Session not found or access denied' } });
        return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const write = (event: string, data: unknown): void => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const { backlog, unsubscribe } = subscribeToSession(session, (browserEvent) => {
        write(browserEvent.event, browserEvent.data);
    });

    // Flush backlog to catch up any missed events
    for (const e of backlog) {
        write(e.event, e.data);
    }

    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, heartbeatIntervalMs);

    req.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
    });
});
