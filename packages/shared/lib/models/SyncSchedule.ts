export enum ScheduleStatus {
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED',
    STOPPED = 'STOPPED'
}

export interface SyncSchedule {
    id: string;
    nango_connection_id: number;
    interval: string;
    schedule_id: string;
    status: ScheduleStatus;
    creator: string;
    created_at: string;
    updated_at: string;
}
