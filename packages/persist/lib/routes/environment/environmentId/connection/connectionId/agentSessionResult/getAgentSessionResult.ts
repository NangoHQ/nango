import { records } from '@nangohq/records';
import { agentSessionResultModel } from '@nangohq/shared';
import { validateRequest } from '@nangohq/utils';

import { getAgentSessionResultRequestParser } from './validate.js';

import type { AuthLocals } from '../../../../../../middleware/auth.middleware.js';
import type { ApiError, Endpoint, GetAgentSessionResultSuccess } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

type GetAgentSessionResult = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        environmentId: number;
        nangoConnectionId: number;
    };
    Querystring: {
        sessionId: string;
        recordId: string;
    };
    Error: ApiError<'get_agent_session_result_failed'>;
    Success: GetAgentSessionResultSuccess;
}>;

const path = '/environment/:environmentId/connection/:nangoConnectionId/agent-session-result';
const method = 'GET';

const validate = validateRequest<GetAgentSessionResult>(getAgentSessionResultRequestParser);

const handler = async (_req: EndpointRequest, res: EndpointResponse<GetAgentSessionResult, AuthLocals>) => {
    const {
        parsedParams: { nangoConnectionId },
        parsedQuery: { sessionId, recordId },
        plan
    } = res.locals;

    // The model is built here and never taken from the caller, so this route can only read agent session results.
    const result = await records.getRecords({
        connectionId: nangoConnectionId,
        model: agentSessionResultModel(sessionId),
        externalIds: [recordId],
        limit: 1,
        plan
    });
    if (result.isErr()) {
        res.status(500).json({ error: { code: 'get_agent_session_result_failed', message: `Failed to get agent session result: ${result.error.message}` } });
        return;
    }

    res.json({ record: result.value.records[0] ?? null });
};

export const route: Route<GetAgentSessionResult> = { path, method };

export const routeHandler: RouteHandler<GetAgentSessionResult, AuthLocals> = {
    method,
    path,
    validate,
    handler
};
