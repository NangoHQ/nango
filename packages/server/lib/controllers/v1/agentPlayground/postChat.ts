import { pipeUIMessageStreamToResponse, validateUIMessages } from 'ai';
import { z } from 'zod';

import { getFlags } from '@nangohq/feature-flags';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { startTurn } from '../../../services/agentPlayground.service.js';
import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';

import type { PlaygroundUIMessage } from '../../../services/agentPlayground.service.js';
import type { PostAgentPlaygroundChat } from '@nangohq/types';

export function isTimeZone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat('en', { timeZone });
        return true;
    } catch {
        return false;
    }
}

const bodySchema = z.object({
    sessionId: z.uuid().optional(),
    messages: z.array(z.unknown()).min(1).max(200),
    timeZone: z.string().refine(isTimeZone, { message: 'Unknown IANA time zone' }).optional()
});

export const postAgentPlaygroundChat = asyncWrapperWithEnvironment<PostAgentPlaygroundChat>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { account, environment, plan, user } = res.locals;

    if (!(await getFlags().isAgentPlaygroundEnabled(account.uuid))) {
        res.status(404).send({ error: { code: 'feature_disabled', message: 'Agent Playground is not enabled for this account' } });
        return;
    }

    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }

    let messages: PlaygroundUIMessage[];
    try {
        messages = await validateUIMessages<PlaygroundUIMessage>({ messages: body.data.messages });
    } catch (err) {
        res.status(400).send({ error: { code: 'invalid_body', message: err instanceof Error ? err.message : 'Invalid messages' } });
        return;
    }
    // History comes from the browser, so it must not carry system instructions.
    if (messages.some((message) => message.role === 'system')) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'System messages are not allowed' } });
        return;
    }

    const aborted = new AbortController();
    res.on('close', () => {
        if (!res.writableFinished) {
            aborted.abort();
        }
    });

    const stream = await startTurn({
        ctx: { account, environment, plan, user },
        sessionId: body.data.sessionId,
        messages,
        timeZone: body.data.timeZone ?? 'UTC',
        abortSignal: aborted.signal
    });

    if (stream.isErr()) {
        res.status(500).send({ error: { code: stream.error.code, message: stream.error.message } });
        return;
    }

    await pipeUIMessageStreamToResponse({ response: res, stream: stream.value });
});
