import { Err, Ok } from '@nangohq/utils';

import { generateInlineFunctionUuid, isInlineFunctionUuid } from './uuid.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export const INLINE_FUNCTIONS_TABLE = 'agent_sessions_inline_functions';
export const maxInlineFunctionCodeLength = 8192;
const maxDescriptionLength = 1024;

export interface DBInlineFunction {
    readonly uuid: string;
    readonly environment_id: number;
    readonly agent_session_id: string;
    readonly code: string;
    readonly description: string | null;
    readonly result_record_id: string;
    readonly created_at: Date;
}

export interface InlineFunction {
    uuid: string;
    environmentId: number;
    agentSessionId: string;
    code: string;
    description: string | null;
    resultRecordId: string;
    createdAt: Date;
}

export class InlineFunctionError extends Error {
    constructor(
        public readonly code: 'invalid_code' | 'invalid_description' | 'server_error',
        message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
    }
}

export async function create(
    db: Knex,
    {
        environmentId,
        agentSessionId,
        code,
        description,
        resultRecordId
    }: { environmentId: number; agentSessionId: string; code: string; description?: string | undefined; resultRecordId: string }
): Promise<Result<InlineFunction, InlineFunctionError>> {
    if (code.length === 0 || code.length > maxInlineFunctionCodeLength) {
        return Err(new InlineFunctionError('invalid_code', `Inline code must be between 1 and ${maxInlineFunctionCodeLength} characters`));
    }
    if (description !== undefined && (description.length === 0 || description.length > maxDescriptionLength)) {
        return Err(new InlineFunctionError('invalid_description', `The description must be between 1 and ${maxDescriptionLength} characters`));
    }

    try {
        const [row] = await db<DBInlineFunction>(INLINE_FUNCTIONS_TABLE)
            .insert({
                uuid: generateInlineFunctionUuid(),
                environment_id: environmentId,
                agent_session_id: agentSessionId,
                code,
                description: description ?? null,
                result_record_id: resultRecordId
            })
            .returning('*');
        if (!row) {
            return Err(new InlineFunctionError('server_error', 'Failed to create the inline function'));
        }
        return Ok(toInlineFunction(row));
    } catch (err) {
        return Err(new InlineFunctionError('server_error', 'Failed to create the inline function', { cause: err }));
    }
}

export async function get(db: Knex, { environmentId, uuid }: { environmentId: number; uuid: string }): Promise<Result<InlineFunction | undefined>> {
    if (!isInlineFunctionUuid(uuid)) {
        return Ok(undefined);
    }
    try {
        const row = await db<DBInlineFunction>(INLINE_FUNCTIONS_TABLE).where({ uuid, environment_id: environmentId }).first();
        return Ok(row ? toInlineFunction(row) : undefined);
    } catch (err) {
        return Err(new Error('failed_to_get_inline_function', { cause: err }));
    }
}

export async function deleteBySession(db: Knex, { agentSessionId }: { agentSessionId: string }): Promise<Result<number>> {
    try {
        return Ok(await db<DBInlineFunction>(INLINE_FUNCTIONS_TABLE).where({ agent_session_id: agentSessionId }).delete());
    } catch (err) {
        return Err(new Error('failed_to_delete_session_inline_functions', { cause: err }));
    }
}

function toInlineFunction(row: DBInlineFunction): InlineFunction {
    return {
        uuid: row.uuid,
        environmentId: row.environment_id,
        agentSessionId: row.agent_session_id,
        code: row.code,
        description: row.description,
        resultRecordId: row.result_record_id,
        createdAt: row.created_at
    };
}
