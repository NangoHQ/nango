import type { Task } from '@nangohq/scheduler';
import EventEmitter from 'node:events';

export class EventsHandler extends EventEmitter {
    public readonly onCallbacks: {
        CREATED: (task: Task) => void;
        STARTED: (task: Task) => void;
        SUCCEEDED: (task: Task) => void;
        FAILED: (task: Task) => void;
        EXPIRED: (task: Task) => void;
        CANCELLED: (task: Task) => void;
    };

    constructor(on: {
        CREATED: (task: Task) => void;
        STARTED: (task: Task) => void;
        SUCCEEDED: (task: Task) => void;
        FAILED: (task: Task) => void;
        EXPIRED: (task: Task) => void;
        CANCELLED: (task: Task) => void;
    }) {
        super();
        this.onCallbacks = {
            CREATED: (task: Task) => {
                on.CREATED(task);
                this.emit(`task:created:${task.groupKey}`, task);
            },
            STARTED: (task: Task) => {
                on.STARTED(task);
                this.emit(`task:started:${task.id}`, task);
            },
            SUCCEEDED: (task: Task) => {
                on.SUCCEEDED(task);
                this.emit(`task:completed:${task.id}`, task);
            },
            FAILED: (task: Task) => {
                on.FAILED(task);
                this.emit(`task:completed:${task.id}`, task);
            },
            EXPIRED: (task: Task) => {
                on.EXPIRED(task);
                this.emit(`task:completed:${task.id}`, task);
            },
            CANCELLED: (task: Task) => {
                on.CANCELLED(task);
                this.emit(`task:completed:${task.id}`, task);
            }
        };
    }
}
