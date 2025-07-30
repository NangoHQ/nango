import { Publisher } from './publisher.js';
import { Subscriber } from './subscriber.js';
import { LocalTransport } from './transport/local.js';

export * from './publisher.js';
export * from './subscriber.js';

export const publisher = new Publisher(new LocalTransport());
export const subscriber = new Subscriber(new LocalTransport());
