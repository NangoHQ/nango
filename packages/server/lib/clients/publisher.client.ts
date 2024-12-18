import type { WebSocket } from 'ws';
import type { RedisClientType } from 'redis';
import * as uuid from 'uuid';
import { createClient } from 'redis';
import { getLogger } from '@nangohq/utils';
import type { WSErr } from '../utils/web-socket-error.js';
import { errorHtml, successHtml } from '../utils/utils.js';
import { getRedisUrl } from '@nangohq/shared';

const logger = getLogger('Server.Publisher');

const enum MessageType {
    ConnectionAck = 'connection_ack',
    Error = 'error',
    Success = 'success'
}

export type WebSocketClientId = string;

export class Redis {
    // Two redis clients are needed because the same client cannot be used for both publishing and subscribing
    // more at https://redis.io/commands/subscribe/
    private url: string;
    private pub: RedisClientType;
    private sub: RedisClientType;

    constructor(url: string) {
        this.url = url;
        this.pub = createClient({ url: this.url });
        this.pub.on('error', (err: Error) => {
            logger.error(`Redis (publisher) error`, err);
        });
        this.pub.on('connect', () => {
            logger.info(`Redis (publisher) connected to ${this.url}`);
        });
        this.sub = createClient({ url: this.url }) as RedisClientType;
        this.sub.on('error', (err: Error) => {
            logger.error(`Redis (subscriber) error`, err);
        });
        this.sub.on('connect', () => {
            logger.info(`Redis Subscriber connected to ${this.url}`);
        });
    }

    public async connect() {
        await this.pub.connect();
        await this.sub.connect();
    }

    public async publish(channel: string, message: string) {
        await this.pub.publish(channel, message);
    }

    public async subscribe(channel: string, onMessage: (message: string, channel: string) => void) {
        await this.sub.subscribe(channel, (message, channel) => {
            onMessage(message, channel);
        });
    }

    public async unsubscribe(channel: string) {
        await this.sub.unsubscribe(channel);
    }
}

class RedisPublisher {
    private redis: Redis;

    public static REDIS_CHANNEL_PREFIX = 'publisher:';

    constructor(redis: Redis) {
        this.redis = redis;
    }

    public async publish(wsClientId: WebSocketClientId, message: string): Promise<boolean> {
        const channel = RedisPublisher.REDIS_CHANNEL_PREFIX + wsClientId;
        try {
            await this.redis.publish(channel, message);
            return true;
        } catch (err) {
            logger.error(`Error publishing message '${message}' to channel '${channel}'`, err);
            return false;
        }
    }

    public async subscribe(wsClientId: WebSocketClientId, onMessage: (message: string, channel: string) => void) {
        const channel = RedisPublisher.REDIS_CHANNEL_PREFIX + wsClientId;
        try {
            await this.redis.subscribe(channel, (message, channel) => {
                const wsClientId = channel.replace(RedisPublisher.REDIS_CHANNEL_PREFIX, '');
                onMessage(message, wsClientId);
            });
        } catch (err) {
            logger.error(`Error subscribing to redis channel "${channel}"`, err);
        }
    }

    public async unsubscribe(wsClientId: WebSocketClientId) {
        const channel = RedisPublisher.REDIS_CHANNEL_PREFIX + wsClientId;
        try {
            await this.redis.unsubscribe(channel);
        } catch (err) {
            logger.error(`Error unsubscribing from redis channel "${channel}"`, err);
        }
    }
}

class WebSocketPublisher {
    private wsClients = new Map<WebSocketClientId, WebSocket>();

    public subscribe(ws: WebSocket, wsClientId: string): WebSocketClientId {
        this.wsClients.set(wsClientId, ws);
        ws.send(JSON.stringify({ message_type: MessageType.ConnectionAck, ws_client_id: wsClientId }));
        return wsClientId;
    }

    public unsubscribe(wsClientId: WebSocketClientId) {
        this.wsClients.delete(wsClientId);
    }

    public publish(wsClientId: WebSocketClientId, message: string): boolean {
        const client = this.wsClients.get(wsClientId);
        if (client) {
            client.send(message);
            return true;
        }
        return false;
    }
}

export class Publisher {
    // Note:
    // In order to support multiple instances of the server running in parallel,
    // an instance must try first to send a message to the WebSocket client
    // If the message was not sent because this instance doesn't have a WebSocket client for the channel
    // we publish it to Redis for it to be picked up and forwarded to another instance
    // To do this, a server instance must be subscribed to the Redis channel related to the WebSocket it's listening to
    // and forward messages to the WebSocket client when it receives a message on that channel

    private redisPublisher: RedisPublisher | null;
    private wsPublisher: WebSocketPublisher;

    constructor(redisClients: Redis | undefined) {
        this.wsPublisher = new WebSocketPublisher();

        if (redisClients) {
            this.redisPublisher = new RedisPublisher(redisClients);
        } else {
            this.redisPublisher = null;
        }
    }

    public async subscribe(ws: WebSocket, wsClientId = uuid.v4()) {
        this.wsPublisher.subscribe(ws, wsClientId);
        if (this.redisPublisher) {
            const onMessage = async (message: string, channel: string) => {
                this.wsPublisher.publish(channel, message);
                await this.unsubscribe(wsClientId);
            };
            await this.redisPublisher.subscribe(wsClientId, onMessage);
        }
    }

    public async unsubscribe(wsClientId: WebSocketClientId) {
        this.wsPublisher.unsubscribe(wsClientId);
        if (this.redisPublisher) {
            await this.redisPublisher.unsubscribe(wsClientId);
        }
    }

    public async publish(wsClientId: WebSocketClientId, message: string): Promise<boolean> {
        // returns true if the message was sent to the WebSocket client
        // false otherwise
        const delivered = this.wsPublisher.publish(wsClientId, message);
        if (!delivered) {
            // If the message was not sent because this instance doesn't have a WebSocket client for the channel
            // we forward it to another instance via Redis
            if (this.redisPublisher) {
                await this.redisPublisher.publish(wsClientId, message);
            }
        }
        return delivered;
    }

    public async notifyErr(
        res: any,
        wsClientId: WebSocketClientId | undefined,
        providerConfigKey: string | undefined,
        connectionId: string | undefined,
        wsErr: WSErr
    ) {
        logger.debug(`OAuth flow error for provider config "${providerConfigKey}" and connectionId "${connectionId}": ${wsErr.type} - ${wsErr.message}`);
        if (wsClientId) {
            const data = JSON.stringify({
                message_type: MessageType.Error,
                provider_config_key: providerConfigKey,
                connection_id: connectionId,
                error_type: wsErr.type,
                error_desc: wsErr.message
            });
            const published = await this.publish(wsClientId, data);
            if (published) {
                await this.unsubscribe(wsClientId);
            }
        }
        errorHtml(res, wsClientId, wsErr);
    }

    public async notifySuccess(res: any, wsClientId: WebSocketClientId | undefined, providerConfigKey: string, connectionId: string, isPending = false) {
        if (wsClientId) {
            const data = JSON.stringify({
                message_type: MessageType.Success,
                provider_config_key: providerConfigKey,
                connection_id: connectionId,
                is_pending: isPending
            });
            const published = await this.publish(wsClientId, data);
            if (published) {
                await this.unsubscribe(wsClientId);
            }
        }
        successHtml(res, wsClientId, providerConfigKey, connectionId);
    }
}

const redis = await (async () => {
    let redis;
    const url = getRedisUrl();
    if (url) {
        redis = new Redis(url);
        await redis.connect();
    }
    return redis;
})();
export default new Publisher(redis);
