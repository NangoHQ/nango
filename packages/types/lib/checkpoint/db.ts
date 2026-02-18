import type { Timestamps } from '../db.js';
import type { Checkpoint } from './types.js';

/**
 * Checkpoints are identified by a flexible key format that allows
 * attaching checkpoints to various entities:
 *
 * @example Key formats:
 * - `connection:123:config:456` - checkpoint for a specific sync/action per connection
 */
export interface DBCheckpoint extends Timestamps {
    id: number;
    environment_id: number;
    connection_id: number;
    key: string;
    checkpoint: Checkpoint;
    version: number;
    deleted_at: Date | null;
}
