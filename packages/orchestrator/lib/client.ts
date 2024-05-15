import type { Json } from '@nangohq/scheduler';
import { route as scheduleRoute } from './routes/v1/schedule.js';
import { route as outputRoute } from './routes/v1/taskId/output.js';
import type { Result, Route } from '@nangohq/utils';
import { Ok, Err, routeFetch } from '@nangohq/utils';
import type { EndpointDefinition } from '@nangohq/types';

interface SchedulingProps {
    name: string;
    groupKey: string;
    retry: {
        count: number;
        max: number;
    };
    timeoutSettingsInSecs: {
        createdToStarted: number;
        startedToCompleted: number;
        heartbeat: number;
    };
    args: {
        name: string;
        connection: {
            id: number;
            provider_config_key: string;
            environment_id: number;
        };
        activityLogId: number;
        input: Json;
    };
}

export class OrchestratorClient {
    private fetchTimeoutMs: number;
    private baseUrl: string;

    constructor({ baseUrl, fetchTimeoutMs = 120_000 }: { baseUrl: string; fetchTimeoutMs?: number }) {
        this.baseUrl = baseUrl;
        this.fetchTimeoutMs = fetchTimeoutMs;
    }

    private routeFetch<E extends EndpointDefinition>(route: Route<E>) {
        return routeFetch(this.baseUrl, route);
    }

    public async schedule(props: SchedulingProps): Promise<Result<{ taskId: string }>> {
        const res = await this.routeFetch(scheduleRoute)({
            body: {
                scheduling: 'immediate',
                name: props.name,
                groupKey: props.groupKey,
                retry: props.retry,
                timeoutSettingsInSecs: props.timeoutSettingsInSecs,
                args: props.args
            }
        });
        if ('error' in res) {
            return Err(`${res.error.code}: ${res.error.message || 'Unknown error'}`);
        } else {
            return Ok(res);
        }
    }

    async execute(props: Pick<Partial<SchedulingProps>, 'name' | 'groupKey' | 'args'>): Promise<Result<Json>> {
        const scheduleProps = {
            retry: { count: 0, max: 0 },
            timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
            ...props
        } as SchedulingProps;
        const res = await this.schedule(scheduleProps);
        if (res.isErr()) {
            return res;
        }
        const taskId = res.value.taskId;
        const start = Date.now();
        const timeoutInMs = this.fetchTimeoutMs;
        while (Date.now() - start < timeoutInMs) {
            const res = await this.routeFetch(outputRoute)({ params: { taskId } });
            if ('error' in res) {
                return Err(res.error.message || 'Unknown error');
            } else if (res.output) {
                return Ok(res.output);
            }
        }
        return Err(`Timeout exceeded: ${JSON.stringify(props)}`);
    }
}
