import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import { migrate, Scheduler, clearDb } from '@nangohq/scheduler';
import { getServer } from './server.js';
import { ConductorClient } from './client.js';

describe('Client', () => {
    const scheduler = new Scheduler({
        on: {
            CREATED: (task) => console.log(`Task ${task.id} created`),
            STARTED: (task) => console.log(`Task ${task.id} started`),
            SUCCEEDED: (task) => console.log(`Task ${task.id} succeeded`),
            FAILED: (task) => console.log(`Task ${task.id} failed`),
            EXPIRED: (task) => console.log(`Task ${task.id} expired`),
            CANCELLED: (task) => console.log(`Task ${task.id} cancelled`)
        }
    });
    const server = getServer({ scheduler });
    const port = Math.floor(Math.random() * 1000) + 11000;
    const client = new ConductorClient({ baseUrl: `http://localhost:${port}`, fetchTimeoutMs: 10_000 });

    beforeAll(async () => {
        await migrate();
        server.listen(port);
    });

    afterAll(async () => {
        scheduler.stop();
        await clearDb();
    });

    it('should schedule immediate task', async () => {
        const groupKey = 'groupA';
        const res = (
            await client.schedule({
                name: 'Task',
                groupKey: groupKey,
                retry: { count: 3, max: 5 },
                timeoutsInSecs: {
                    createdToStarted: 10,
                    startedToCompleted: 10,
                    heartbeat: 10
                },
                args: {
                    name: 'Action',
                    connection: {
                        id: 1234,
                        provider_config_key: 'P',
                        environment_id: 5678
                    },
                    activityLogId: 9876,
                    input: { foo: 'bar' }
                }
            })
        ).unwrap();
        const tasks = (await scheduler.list({ groupKey })).unwrap();
        expect(tasks.length).toBe(1);
        expect(tasks[0]?.id).toBe(res.taskId);
        expect(tasks[0]?.state).toBe('CREATED');
    });

    it('should execute', async () => {
        const groupKey = 'groupB';
        const output = { count: 9 };

        // simulating a processor that is starting and successfully processing tasks
        const processing = setInterval(async () => {
            const tasks = (await scheduler.list({ groupKey })).unwrap();
            for (const task of tasks) {
                switch (task.state) {
                    case 'CREATED':
                        scheduler.dequeue({ groupKey, limit: 1 });
                        break;
                    case 'STARTED':
                        scheduler.succeed({ taskId: task.id, output });
                        break;
                }
            }
        }, 100);

        const res = await client.execute({
            name: 'Task',
            groupKey: groupKey,
            args: {
                name: 'Action',
                connection: {
                    id: 1234,
                    provider_config_key: 'P',
                    environment_id: 5678
                },
                activityLogId: 9876,
                input: { foo: 'bar' }
            }
        });
        expect(res.unwrap()).toEqual(output);
        clearTimeout(processing);
    });
});
