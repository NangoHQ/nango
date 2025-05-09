import { setTimeout } from 'node:timers/promises';

export async function wait(ms: number): Promise<void> {
    await setTimeout(ms);
}
