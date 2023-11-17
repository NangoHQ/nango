import type { Timestamps } from './Generic';
import type { SyncConfigType } from './Sync';

export interface SlackNotification extends Timestamps {
    id?: number;
    open: boolean;
    environment_id: number;
    name: string;
    type: SyncConfigType;
    connection_list: number[];
    slack_timestamp?: string;
    admin_slack_timestamp?: string;
}
