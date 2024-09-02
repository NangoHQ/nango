import type { Timestamps } from '../db';

export interface DBSlackNotification extends Timestamps {
    id: number;
    open: boolean;
    environment_id: number;
    name: string;
    type: string;
    connection_list: number[];
    slack_timestamp: string | null;
    admin_slack_timestamp: string | null;
}
