import type { Task } from '@nangohq/scheduler';
import EventEmitter from 'node:events';

type TaskEvent = 'completed';

export function getEventId(event: TaskEvent, taskId: string) {
    return `task:${event}:${taskId}`;
}

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
            },
            STARTED: (task: Task) => {
                on.STARTED(task);
            },
            SUCCEEDED: (task: Task) => {
                on.SUCCEEDED(task);
                this.emitEvent('completed', task);
            },
            FAILED: (task: Task) => {
                on.FAILED(task);
                this.emitEvent('completed', task);
            },
            EXPIRED: (task: Task) => {
                on.EXPIRED(task);
                this.emitEvent('completed', task);
            },
            CANCELLED: (task: Task) => {
                on.CANCELLED(task);
                this.emitEvent('completed', task);
            }
        };
    }

    private emitEvent(event: TaskEvent, task: Task) {
        this.emit(getEventId(event, task.id), task);
    }
}
