import type { Jsonable } from '@nangohq/types';

type FleetErrorCode =
    | 'no_active_deployment'
    | 'deployment_creation_failed'
    | 'deployment_get_active_failed'
    | 'deployment_not_found'
    | 'node_invalid_state_transition'
    | 'node_not_found'
    | 'node_creation_failed'
    | 'node_search_failed'
    | 'node_transition_failed'
    | 'node_fail_failed'
    | 'node_register_failed'
    | 'node_delete_failed'
    | 'node_delete_non_terminated'
    | 'supervisor_search_nodes_failed'
    | 'supervisor_unknown_action'
    | 'supervisor_tick_failed'
    | 'fleet_node_not_ready_timeout'
    | 'fleet_node_url_not_found'
    | 'fleet_node_outdate_failed'
    | 'fleet_tick_timeout'
    | 'local_runner_start_failed';

export class FleetError extends Error {
    public readonly context?: Jsonable;

    constructor(code: FleetErrorCode, options: { cause?: unknown; context?: Jsonable } = {}) {
        const { cause, context } = options;
        super(code, { cause });
        this.name = this.constructor.name;
        this.context = context;
    }
}
