import { z } from 'zod';

import { defineTask } from '@nangohq/task-queue';
import { Ok } from '@nangohq/utils';

/**
 * Template task. Copy this file to add a new task type: define a payload schema, implement the
 * handler, then register it in `../index.ts`. Enqueue with `taskQueue.enqueue('example', { message })`.
 */
export const exampleTask = defineTask({
    type: 'example',
    schema: z.object({ message: z.string() }),
    handle: (payload, ctx) => {
        ctx.logger.info(`[tasks:example] ${payload.message} (task ${ctx.taskId}, attempt ${ctx.attempt})`);
        return Promise.resolve(Ok(undefined));
    }
});
