import { z } from 'zod';

import { requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { resolveActor } from '../../middleware/audit/auditable.js';
import * as agentSessionTerminationService from '../../services/agentSessionTermination.service.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';

import type { DeleteAgentSession } from '@nangohq/types';

const paramsSchema = z.strictObject({
    sessionId: z.string().uuid()
});

export const deleteAgentSession = asyncWrapperWithEnvironment<DeleteAgentSession>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }

    const { account, environment } = res.locals;
    const terminated = await agentSessionTerminationService.terminateAgentSession({
        account,
        environment,
        sessionId: params.data.sessionId,
        endedBy: resolveActor(res.locals)
    });

    if (terminated.isErr()) {
        if (terminated.error.code === 'not_found') {
            res.status(404).send({ error: { code: 'not_found', message: terminated.error.message } });
            return;
        }

        res.status(500).send({ error: { code: 'server_error', message: terminated.error.message } });
        return;
    }

    res.status(200).send({
        data: {
            session_id: terminated.value.sessionId,
            ended_at: terminated.value.endedAt.toISOString(),
            reason: terminated.value.reason
        }
    });
});
