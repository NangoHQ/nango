import { assistantModelMessageSchema, toolModelMessageSchema, userModelMessageSchema } from 'ai';
import { z } from 'zod';

import { getFlags } from '@nangohq/feature-flags';
import { getLogger, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { runTurn } from '../../../services/agentPlayground.service.js';
import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';

import type { PostAgentPlaygroundChat } from '@nangohq/types';

const logger = getLogger('AgentPlayground');

const bodySchema = z.strictObject({
    sessionId: z.uuid().optional(),
    // No system role: history comes from the browser and must not carry instructions.
    messages: z.array(z.union([userModelMessageSchema, assistantModelMessageSchema, toolModelMessageSchema])).max(200),
    prompt: z.string().trim().min(1).max(10_000)
});

export const postAgentPlaygroundChat = asyncWrapperWithEnvironment<PostAgentPlaygroundChat>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { account, environment, plan } = res.locals;

    if (!(await getFlags().isAgentPlaygroundEnabled(account.uuid))) {
        res.status(404).send({ error: { code: 'feature_disabled', message: 'Agent Playground is not enabled for this account' } });
        return;
    }

    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }

    const turn = await runTurn({
        ctx: { account, environment, plan },
        sessionId: body.data.sessionId,
        history: body.data.messages,
        prompt: body.data.prompt
    });

    if (turn.isErr()) {
        logger.error(`Agent Playground turn failed: ${turn.error.message}`);
        res.status(turn.error.code === 'model_error' ? 502 : 500).send({ error: { code: turn.error.code, message: turn.error.message } });
        return;
    }

    const { usage } = turn.value;
    logger.info(
        `Agent Playground turn: ${usage.inputTokens} in / ${usage.outputTokens} out tokens, ${usage.cachedModelCalls}/${usage.modelCalls} model calls from cache`
    );

    res.status(200).send({ data: turn.value });
});
