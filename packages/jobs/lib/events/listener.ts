// Interface for listening to a queue for events

export interface QueueMessage {
    body: string;
}

export interface EventListener {
    listen(queue: string, onMessage?: (message: QueueMessage) => Promise<void>): Promise<void>;
}
