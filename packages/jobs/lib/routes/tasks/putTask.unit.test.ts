import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INTERNAL_SERVICE_AUTH_LOCALS_KEY } from '@nangohq/internal-auth';

import { taskPropsBoundToCapability } from './capability-props.js';
import { routeHandler } from './putTask.js';

import type { InternalServiceAuth, TaskCapabilityResource } from '@nangohq/internal-auth';
import type { PutTask } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse } from '@nangohq/utils';

const { getSyncJobByRunId, handle } = vi.hoisted(() => ({
    getSyncJobByRunId: vi.fn(),
    handle: vi.fn()
}));

vi.mock('@nangohq/shared', () => ({ getSyncJobByRunId }));
vi.mock('../../execution/operations/handler.js', () => ({ handle }));

const taskId = '11111111-1111-4111-8111-111111111111';
const syncId = '33333333-3333-4333-8333-333333333333';
const resource: TaskCapabilityResource = {
    environmentId: 1,
    connectionId: 2,
    syncId
};
const syncJob = { id: 7, sync_id: syncId, run_id: taskId };

const boundProps = {
    environmentId: 1,
    nangoConnectionId: 2,
    syncId: resource.syncId,
    syncJobId: syncJob.id
};

const foreignProps = {
    environmentId: 424242,
    nangoConnectionId: 515151,
    syncId: '99999999-9999-4999-8999-999999999999',
    syncJobId: 616161
};

function capabilityAuth(res: TaskCapabilityResource | undefined = resource): InternalServiceAuth {
    return {
        kind: 'jwt',
        subject: `task:${taskId}`,
        audience: 'jobs',
        issuer: 'service:jobs',
        sub: `task:${taskId}`,
        ...(res ? { res } : {}),
        scopes: ['jobs:putTask']
    };
}

function fakeResponse(auth: InternalServiceAuth | undefined, nangoProps: Record<string, unknown>) {
    const res = {
        locals: {
            parsedParams: { taskId },
            parsedBody: {
                nangoProps,
                output: null,
                telemetryBag: { customLogs: 0, proxyCalls: 0, durationMs: 0, memoryGb: 1 },
                functionRuntime: 'runner',
                checkpoints: null
            },
            ...(auth ? { [INTERNAL_SERVICE_AUTH_LOCALS_KEY]: auth } : {})
        },
        statusCode: 0,
        body: undefined as unknown,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(body: unknown) {
            this.body = body;
            return this;
        },
        send() {
            return this;
        }
    };
    return res;
}

async function put(auth: InternalServiceAuth | undefined, nangoProps: Record<string, unknown>) {
    const res = fakeResponse(auth, nangoProps);
    await routeHandler.handler({} as EndpointRequest, res as unknown as EndpointResponse<PutTask>, () => undefined);
    return res;
}

describe('taskPropsBoundToCapability', () => {
    it('accepts the environment, connection, sync, and sync job stored for this task', () => {
        expect(taskPropsBoundToCapability(resource, boundProps, taskId, syncJob)).toBe(true);
    });

    it('rejects body identifiers that are not the token resource or this task sync job', () => {
        expect(taskPropsBoundToCapability(resource, foreignProps, taskId, syncJob)).toBe(false);
    });

    it('rejects a sync job from another run of the same sync', () => {
        expect(taskPropsBoundToCapability(resource, boundProps, taskId, { ...syncJob, run_id: '22222222-2222-4222-8222-222222222222' })).toBe(false);
    });

    it('rejects a sync id when the token is not bound to a sync', () => {
        const action: TaskCapabilityResource = { environmentId: 1, connectionId: 2 };
        expect(taskPropsBoundToCapability(action, { environmentId: 1, nangoConnectionId: 2, syncId: resource.syncId, syncJobId: 7 }, taskId, syncJob)).toBe(
            false
        );
        expect(taskPropsBoundToCapability(action, { environmentId: 1, nangoConnectionId: 2 }, taskId, null)).toBe(true);
    });
});

describe('PUT /tasks/:taskId', () => {
    beforeEach(() => {
        getSyncJobByRunId.mockReset();
        handle.mockReset();
        handle.mockResolvedValue(undefined);
        getSyncJobByRunId.mockResolvedValue(syncJob);
    });

    it('does not apply a capability token to another tenant sync job', async () => {
        const res = await put(capabilityAuth(), foreignProps);

        expect(res.statusCode).toBe(401);
        expect(handle).not.toHaveBeenCalled();
    });

    it('applies a capability token when the body matches the token and the task sync job', async () => {
        const res = await put(capabilityAuth(), boundProps);

        expect(res.statusCode).toBe(204);
        expect(getSyncJobByRunId).toHaveBeenCalledWith(taskId);
        expect(handle).toHaveBeenCalledOnce();
        expect(handle.mock.calls[0]?.[0]).toMatchObject({ taskId, nangoProps: boundProps });
    });

    it('rejects a sync job id when this task has no sync job row', async () => {
        getSyncJobByRunId.mockResolvedValue(null);

        const res = await put(capabilityAuth(), boundProps);

        expect(res.statusCode).toBe(401);
        expect(handle).not.toHaveBeenCalled();
    });

    it('rejects sync identifiers on an action capability token', async () => {
        const res = await put(capabilityAuth({ environmentId: 1, connectionId: 2 }), {
            environmentId: 1,
            nangoConnectionId: 2,
            syncId: resource.syncId,
            syncJobId: 616161
        });

        expect(res.statusCode).toBe(401);
        expect(getSyncJobByRunId).not.toHaveBeenCalled();
        expect(handle).not.toHaveBeenCalled();
    });

    it('still accepts a body from legacy task auth that carries no resource claim', async () => {
        const hmac: InternalServiceAuth = { kind: 'hmac', subject: 'jobs', audience: 'jobs', op: 'task', taskId };
        const res = await put(hmac, foreignProps);

        expect(res.statusCode).toBe(204);
        expect(handle).toHaveBeenCalledOnce();
    });
});
