import { describe, expect, it } from 'vitest';

import { NangoError } from '@nangohq/shared';

import { InternalMcpError, PublicMcpError } from '../../../mcp/utils.js';
import { queryRunErrorToMcp } from './errors.js';

function mapped(type: string, payload: Record<string, unknown>): { code: string | undefined; message: string } {
    const error = queryRunErrorToMcp(new NangoError(type, payload));
    expect(error).toBeInstanceOf(PublicMcpError);
    return { code: (error as PublicMcpError).code, message: error.message };
}

describe('queryRunErrorToMcp', () => {
    it('gives the line of the first frame in the agent code when the code throws', () => {
        const { code, message } = mapped('script_internal_error', {
            name: 'TypeError',
            message: "Cannot read properties of undefined (reading 'map')",
            stacktrace: [
                "TypeError: Cannot read properties of undefined (reading 'map')",
                'at eval (inline-github.cjs:3:22)',
                'at eval (inline-github.cjs:7:10)'
            ]
        });

        expect(code).toBe('code_failed');
        expect(message).toBe(
            "The code threw TypeError at line 3: Cannot read properties of undefined (reading 'map'). Fix it and call nango_query_result again."
        );
    });

    it('leaves the line out when no frame is in the agent code', () => {
        const { message } = mapped('script_internal_error', {
            name: 'Error',
            message: 'boom',
            stacktrace: ['Error: boom', 'at run (evalmachine.<anonymous>:1:1)']
        });

        expect(message).toBe('The code threw Error: boom. Fix it and call nango_query_result again.');
    });

    it('passes a syntax error through with its line', () => {
        const { code, message } = mapped('invalid_inline_source', { message: 'Unexpected token )', line: 2 });

        expect(code).toBe('invalid_code');
        expect(message).toBe('The code does not parse at line 2: Unexpected token ). Fix it and call nango_query_result again.');
    });

    it('tells the agent not to redeclare result', () => {
        const { message } = mapped('invalid_inline_source', { message: "Identifier 'result' has already been declared", line: 1 });

        expect(message).toContain('`result` already holds the stored result, so do not declare it.');
    });

    it('tells the agent to call the tool again when the stored result is gone', () => {
        const { code, message } = mapped('agent_session_result_not_found', { message: 'The stored result was not found.' });

        expect(code).toBe('result_not_found');
        expect(message).toContain('call the tool that returned it again');
    });

    it('tells the agent to return less when the runner rejects the output size', () => {
        const { code, message } = mapped('script_internal_error', {
            name: 'Error',
            message: 'Output size is too large: 3000000 bytes. Maximum allowed size is 2097152 bytes (2MB).'
        });

        expect(code).toBe('output_too_large');
        expect(message).toContain('more than 2 MB');
    });

    it('reports a timeout when the task expired', () => {
        const { code } = mapped('function_failure', { error: 'Task 0b9c1f4e-1111-4222-8333-944455556666 expired' });

        expect(code).toBe('timeout');
    });

    it('clips a long message', () => {
        const { message } = mapped('script_internal_error', { name: 'Error', message: 'x'.repeat(2000) });

        expect(message.length).toBeLessThan(600);
    });

    it('hides anything the agent code did not cause', () => {
        expect(queryRunErrorToMcp(new NangoError('function_failure', { error: 'connection refused' }))).toBeInstanceOf(InternalMcpError);
        expect(queryRunErrorToMcp(new Error('boom'))).toBeInstanceOf(InternalMcpError);
    });
});
