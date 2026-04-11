import { z } from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { answerSession, getSessionByToken } from '../../../../../services/agent/agent-session.service.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';

import type { PostAgentSessionAnswer } from '@nangohq/types';

const paramsSchema = z
    .object({
        sessionToken: z.string().min(1)
    })
    .strict();

const bodySchema = z
    .object({
        question_id: z.string().min(1),
        response: z.string().min(1)
    })
    .strict();

export const postAgentSessionAnswer = asyncWrapper<PostAgentSessionAnswer>(async (req, res) => {
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

    const valBody = bodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { sessionToken } = valParams.data;
    const body = valBody.data;
    const { environment } = res.locals;

    const session = await getSessionByToken(sessionToken, environment.id);
    if (!session) {
        res.status(404).send({ error: { code: 'not_found', message: 'Session not found or access denied' } });
        return;
    }

    try {
        await answerSession(session, body);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).send({ error: { code: 'invalid_request', message } });
        return;
    }

    res.status(200).send({
        success: true,
        accepted_at: new Date().toISOString()
    });
});
