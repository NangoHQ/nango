import { Publisher } from './publisher.js';
import { Subscriber } from './subscriber.js';
import { LocalTransport } from './transport/local.js';

export * from './publisher.js';
export * from './subscriber.js';

const transport = new LocalTransport();

export const publisher = new Publisher(transport);
export const subscriber = new Subscriber(transport);
