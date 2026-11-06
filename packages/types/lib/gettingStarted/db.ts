import type { Timestamps } from '../db.js';

/**
 * One per account. Progress of the agent-first getting started flow, shared by everyone in the account.
 * Each timestamp is set the first time its event happens.
 */
export interface DBAccountGettingStarted extends Timestamps {
    account_id: number;
    first_agent_connection_at: Date | null;
    first_tool_call_at: Date | null;
    dismissed_at: Date | null;
}
