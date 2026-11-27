import { configService, resolveLegacyAction } from '@nangohq/shared';
import { Err, getLogger } from '@nangohq/utils';

import { ActionExecutionError, executeAction } from '../../../services/action.service.js';
import { validateMcpActionInput } from '../inputValidation.js';

import type { ActionExecution, ActionExecutionSuccess } from '../../../services/action.service.js';
import type { ResolvedLegacyAction } from '@nangohq/shared';
import type { Result } from '@nangohq/types';

const logger = getLogger('Server.MCP.Actions');

export class McpActionInputError extends Error {
    readonly code = 'invalid_input';
    readonly nangoError = undefined;

    constructor(readonly detail: string) {
        super(`Invalid input: ${detail}. Pass a JSON value matching the input schema.`);
    }
}

export type McpActionExecutionError = ActionExecutionError | McpActionInputError;
export type McpActionExecution = Omit<ActionExecution, 'result'> & { result: Result<ActionExecutionSuccess, McpActionExecutionError> };

/** Validate MCP input before dispatching to the unchanged legacy action executor. */
export async function executeMcpAction({
    resolvedAction,
    ...args
}: Parameters<typeof executeAction>[0] & {
    resolvedAction?: Exclude<ResolvedLegacyAction, { kind: 'missing' }>;
}): Promise<McpActionExecution> {
    if (typeof args.input !== 'string') return await executeAction(args);

    try {
        let action = resolvedAction;
        if (!action) {
            const integration = await configService.getProviderConfig(args.providerConfigKey, args.environment.id);
            if (!integration) return await executeAction(args);
            const resolved = await resolveLegacyAction({
                accountUuid: args.account.uuid,
                environmentId: args.environment.id,
                integration,
                name: args.actionName
            });
            if (resolved.kind === 'missing') return await executeAction(args);
            action = resolved;
        }
        if (action.kind === 'deployed' && !action.config.enabled) return await executeAction(args);

        const validation = validateMcpActionInput(action, args.input);
        if (validation.isErr()) {
            if (validation.error.code === 'invalid_schema') {
                logger.warning('Skipping MCP action input validation, the input schema is unusable', { err: validation.error });
                return await executeAction(args);
            }
            return {
                logCtx: undefined,
                functionSource: action.kind === 'deployed' ? action.config.source : 'catalog',
                result: Err(new McpActionInputError(validation.error.message))
            };
        }
        return await executeAction(args);
    } catch (err) {
        logger.error('Failed to validate MCP action input', { err });
        return { logCtx: undefined, result: Err(new ActionExecutionError({ code: 'internal_error', message: 'Failed to run action' })) };
    }
}
