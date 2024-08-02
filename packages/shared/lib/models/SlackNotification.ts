import type { Timestamps } from './Generic.js';

export interface SlackNotification extends Timestamps {
    id?: number;
    open: boolean;
    environment_id: number;
    name: string;
    type: string;
    connection_list: number[];
    slack_timestamp?: string;
    admin_slack_timestamp?: string;
}
