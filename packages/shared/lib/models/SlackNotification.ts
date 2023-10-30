import type { Timestamps } from './Generic';
import type { SyncType } from './Sync';

export interface SlackNotification extends Timestamps {
    id?: number;
    open: boolean;
    environment_id: number;
    name: string;
    type: SyncType;
    connection_list: number[];
    slack_timestamp?: string;
    admin_slack_timestamp?: string;
}
