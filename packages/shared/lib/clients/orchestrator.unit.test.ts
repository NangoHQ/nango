import { describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { Orchestrator } from './orchestrator.js';

import type { OrchestratorClientInterface } from './orchestrator.js';
import type { OrchestratorSchedule, SchedulesReturn } from '@nangohq/nango-orchestrator';

function schedule(name: string): OrchestratorSchedule {
    return { id: name, name, frequencyMs: 60_000, state: 'STARTED', nextDueDate: null };
}

function mockClient(searchSchedules: OrchestratorClientInterface['searchSchedules']): OrchestratorClientInterface {
    return { searchSchedules } as unknown as OrchestratorClientInterface;
}

function syncs(count: number, environmentId = 1) {
    return Array.from({ length: count }, (_, i) => ({ syncId: `sync-${i}`, environmentId }));
}

function echoingClient() {
    return vi.fn(({ scheduleNames }: { scheduleNames: string[]; limit: number }): Promise<SchedulesReturn> => {
        return Promise.resolve(Ok(scheduleNames.map(schedule)));
    });
}

describe('Orchestrator.searchSchedules', () => {
    it('splits requests so no batch exceeds the search limit', async () => {
        const searchSchedules = echoingClient();

        const res = await new Orchestrator(mockClient(searchSchedules)).searchSchedules(syncs(2500));

        expect(res.isOk()).toBe(true);
        expect(searchSchedules.mock.calls.map(([{ scheduleNames }]) => scheduleNames.length)).toEqual([1000, 1000, 500]);
        for (const [{ scheduleNames, limit }] of searchSchedules.mock.calls) {
            expect(limit).toBe(scheduleNames.length);
        }
    });

    it('merges every batch into one map keyed by sync id', async () => {
        const res = await new Orchestrator(mockClient(echoingClient())).searchSchedules(syncs(2500));

        const map = res.unwrap();
        expect(map.size).toBe(2500);
        // sync-1500 falls in the second batch.
        expect(map.get('sync-1500')?.name).toBe('environment:1:sync:sync-1500');
    });

    it('fails when a later batch fails', async () => {
        const searchSchedules = vi.fn(({ scheduleNames }: { scheduleNames: string[]; limit: number }): Promise<SchedulesReturn> => {
            if (searchSchedules.mock.calls.length > 1) {
                return Promise.resolve(Err(new Error('boom')));
            }
            return Promise.resolve(Ok(scheduleNames.map(schedule)));
        });

        const res = await new Orchestrator(mockClient(searchSchedules)).searchSchedules(syncs(1500));

        expect(res.isErr()).toBe(true);
        expect(searchSchedules).toHaveBeenCalledTimes(2);
    });

    it('does not call the orchestrator when there are no syncs', async () => {
        const searchSchedules = echoingClient();

        const res = await new Orchestrator(mockClient(searchSchedules)).searchSchedules([]);

        expect(res.unwrap().size).toBe(0);
        expect(searchSchedules).not.toHaveBeenCalled();
    });
});
