import type { Jsonable } from '@nangohq/types';

type FleetErrorCode =
    | 'no_active_deployment'
    | 'deployment_creation_error'
    | 'deployment_get_active_error'
    | 'deployment_not_found'
    | 'node_invalid_state_transition'
    | 'node_not_found'
    | 'node_creation_error'
    | 'node_search_error'
    | 'node_transition_error'
    | 'node_fail_error'
    | 'node_register_error'
    | 'node_delete_error'
    | 'node_delete_non_terminated'
    | 'supervisor_search_nodes_error'
    | 'supervisor_unknown_action';

export class FleetError extends Error {
    public readonly context?: Jsonable;

    constructor(code: FleetErrorCode, options: { cause?: unknown; context?: Jsonable } = {}) {
        const { cause, context } = options;
        super(code, { cause });
        this.name = this.constructor.name;
        this.context = context;
    }
}
