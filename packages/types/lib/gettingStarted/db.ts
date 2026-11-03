import type { Timestamps } from '../db.js';

/**
 * One per account. Holds environment and integration used for getting started flow for that account.
 */
export interface DBGettingStartedMeta extends Timestamps {
    id: number;
    account_id: number;
    environment_id: number;
    integration_id: number;
}

/**
 * One per account. Progress of the agent-first getting started flow, shared by everyone in the account.
 * Each timestamp is set the first time its event happens; restarting clears the progress ones.
 */
export interface DBAccountGettingStarted extends Timestamps {
    account_id: number;
    first_agent_connection_at: Date | null;
    first_tool_call_at: Date | null;
    dismissed_at: Date | null;
}

/**
 * One per user. Holds progress for each user in the getting started flow.
 */
export interface DBGettingStartedProgress extends Timestamps {
    id: number;
    getting_started_meta_id: number;
    user_id: number;
    connection_id: number | null;
    step: number;
}
