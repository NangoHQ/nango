import { NangoError } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../../../mcp/utils.js';

const logger = getLogger('Server.MCP.AgentSession.QueryResult');

const MAX_DETAIL_LENGTH = 500;

// The runner names an inline run's file inline-<integration>.cjs, and its frames carry the line in the agent's code.
const INLINE_FRAME = /\binline-\S*?\.cjs:(\d+):\d+/;
const OUTPUT_TOO_LARGE = /^Output size is too large/;
const TASK_EXPIRED = /^Task \S+ expired$/;

export function resultNotFoundError(): PublicMcpError {
    return new PublicMcpError('This result_id does not match a stored result of this session. Call the tool that returned it again to get a new result_id.', {
        code: 'result_not_found'
    });
}

export function outputTooLargeError(limit: string): PublicMcpError {
    return new PublicMcpError(
        `The code returned more than ${limit}. Return less, such as fewer items, fewer fields or a summary, and call nango_query_result again.`,
        {
            code: 'output_too_large'
        }
    );
}

/** Turns a failed inline run into something the agent can act on. Only what the agent's own code caused is shown to it. */
export function queryRunErrorToMcp(error: unknown): Error {
    if (!(error instanceof NangoError)) {
        logger.error('Unexpected error while running agent session code', { error });
        return new InternalMcpError();
    }

    const payload = isRecord(error.payload) ? error.payload : {};
    switch (error.type) {
        case 'invalid_inline_source': {
            const message = stringOf(payload['message']) ?? 'The code is not a valid function body';
            const line = typeof payload['line'] === 'number' ? payload['line'] : undefined;
            const redeclared = message.includes("'result' has already been declared") ? ' `result` already holds the stored result, so do not declare it.' : '';
            return new PublicMcpError(
                `The code does not parse${line ? ` at line ${line}` : ''}: ${clip(message)}.${redeclared} Fix it and call nango_query_result again.`,
                { code: 'invalid_code' }
            );
        }
        case 'agent_session_result_not_found':
            return resultNotFoundError();
        case 'script_internal_error': {
            const message = stringOf(payload['message']) ?? 'Unknown error';
            if (OUTPUT_TOO_LARGE.test(message)) {
                return outputTooLargeError('2 MB');
            }
            const name = stringOf(payload['name']) ?? 'Error';
            const line = lineOf(payload['stacktrace']);
            return new PublicMcpError(`The code threw ${name}${line ? ` at line ${line}` : ''}: ${clip(message)}. Fix it and call nango_query_result again.`, {
                code: 'code_failed'
            });
        }
        case 'function_failure':
            if (TASK_EXPIRED.test(stringOf(payload['error']) ?? '')) {
                return new PublicMcpError(
                    'The code did not finish in time. Make it do less work, such as one pass over the data, and call nango_query_result again.',
                    {
                        code: 'timeout'
                    }
                );
            }
            break;
    }

    logger.error('Unexpected failure while running agent session code', { type: error.type });
    return new InternalMcpError();
}

function lineOf(stacktrace: unknown): number | undefined {
    if (!Array.isArray(stacktrace)) {
        return undefined;
    }
    for (const frame of stacktrace) {
        const match = typeof frame === 'string' ? INLINE_FRAME.exec(frame) : null;
        if (match?.[1]) {
            return Number(match[1]);
        }
    }
    return undefined;
}

function clip(text: string): string {
    const trimmed = text.trim().replace(/\.$/, '');
    return trimmed.length > MAX_DETAIL_LENGTH ? `${trimmed.slice(0, MAX_DETAIL_LENGTH)}…` : trimmed;
}

function stringOf(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
