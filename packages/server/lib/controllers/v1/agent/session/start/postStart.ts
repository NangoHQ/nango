import { z } from 'zod';

import { configService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { createAgentSession } from '../../../../../services/agent/agent-session.service.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';

import type { PostAgentSessionStart } from '@nangohq/types';

const bodySchema = z
    .object({
        prompt: z.string().min(1),
        integration_id: z.string().min(1),
        connection_id: z.string().optional()
    })
    .strict();

export const postAgentSessionStart = asyncWrapper<PostAgentSessionStart>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = bodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body = valBody.data;
    const { environment } = res.locals;

    const providerConfig = await configService.getProviderConfig(body.integration_id, environment.id);
    if (!providerConfig) {
        res.status(404).send({ error: { code: 'not_found', message: `Integration '${body.integration_id}' was not found` } });
        return;
    }

    const { token, executionTimeoutAt } = await createAgentSession(environment.id, {
        prompt: body.prompt,
        integration_id: body.integration_id,
        ...(body.connection_id ? { connection_id: body.connection_id } : {})
    });

    res.status(201).send({
        session_token: token,
        execution_timeout_at: executionTimeoutAt.toISOString()
    });
});
