import type { Jsonable } from '@nangohq/types';

type FleetErrorCode =
    | 'deployment_creation_error'
    | 'deployment_get_active_error'
    | 'deployment_not_found'
    | 'node_invalid_state_transition'
    | 'node_not_found'
    | 'node_creation_error'
    | 'node_search_error'
    | 'node_transition_error'
    | 'node_fail_error';

export class FleetError extends Error {
    public readonly context?: Jsonable;

    constructor(code: FleetErrorCode, options: { cause?: unknown; context?: Jsonable } = {}) {
        const { cause, context } = options;
        super(code, { cause });
        this.name = this.constructor.name;
        this.context = context;
    }
}
