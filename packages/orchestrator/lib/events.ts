import type { Scheduler, Task } from '@nangohq/scheduler';
import EventEmitter from 'node:events';

export class EventsHandler extends EventEmitter {
    public readonly onCallbacks: {
        CREATED: (scheduler: Scheduler, task: Task) => void;
        STARTED: (scheduler: Scheduler, task: Task) => void;
        SUCCEEDED: (scheduler: Scheduler, task: Task) => void;
        FAILED: (scheduler: Scheduler, task: Task) => void;
        EXPIRED: (scheduler: Scheduler, task: Task) => void;
        CANCELLED: (scheduler: Scheduler, task: Task) => void;
    };

    constructor(on: {
        CREATED: (scheduler: Scheduler, task: Task) => void;
        STARTED: (scheduler: Scheduler, task: Task) => void;
        SUCCEEDED: (scheduler: Scheduler, task: Task) => void;
        FAILED: (scheduler: Scheduler, task: Task) => void;
        EXPIRED: (scheduler: Scheduler, task: Task) => void;
        CANCELLED: (scheduler: Scheduler, task: Task) => void;
    }) {
        super();
        this.onCallbacks = {
            CREATED: (scheduler: Scheduler, task: Task) => {
                on.CREATED(scheduler, task);
                this.emit(`task:created:${task.groupKey}`, task);
            },
            STARTED: (scheduler: Scheduler, task: Task) => {
                on.STARTED(scheduler, task);
                this.emit(`task:started:${task.id}`, task);
            },
            SUCCEEDED: (scheduler: Scheduler, task: Task) => {
                on.SUCCEEDED(scheduler, task);
                this.emit(`task:completed:${task.id}`, task);
            },
            FAILED: (scheduler: Scheduler, task: Task) => {
                on.FAILED(scheduler, task);
                this.emit(`task:completed:${task.id}`, task);
            },
            EXPIRED: (scheduler: Scheduler, task: Task) => {
                on.EXPIRED(scheduler, task);
                this.emit(`task:completed:${task.id}`, task);
            },
            CANCELLED: (scheduler: Scheduler, task: Task) => {
                on.CANCELLED(scheduler, task);
                this.emit(`task:completed:${task.id}`, task);
            }
        };
    }
}
