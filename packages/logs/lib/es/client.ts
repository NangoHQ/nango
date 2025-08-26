import { Client } from '@elastic/elasticsearch';

import { envs } from '../env.js';
import { CircuitBreaker } from './circuitBreaker.js';

const rawClient = new Client({
    nodes: envs.NANGO_LOGS_ES_URL || 'http://localhost:0',
    requestTimeout: 5000,
    maxRetries: 1,
    auth: {
        username: envs.NANGO_LOGS_ES_USER!, // ggignore
        password: envs.NANGO_LOGS_ES_PWD! // ggignore
    }
});

function withCircuitBreaker(target: Client): Client {
    const circuitBreaker = new CircuitBreaker({
        healthCheck: async () => {
            try {
                await target.cluster.health();
                return true;
            } catch {
                return false;
            }
        },
        healthCheckIntervalMs: envs.NANGO_LOGS_CIRCUIT_BREAKER_HEALTHCHECK_INTERVAL_MS,
        failureThreshold: envs.NANGO_LOGS_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
        recoveryThreshold: envs.NANGO_LOGS_CIRCUIT_BREAKER_RECOVERY_THRESHOLD
    });
    return new Proxy(target, {
        get(targetClient, prop) {
            const originalMethod = Reflect.get(targetClient, prop);

            if (typeof originalMethod !== 'function') {
                return originalMethod;
            }

            return async function (...args: any[]) {
                if (circuitBreaker.isOpen()) {
                    throw new Error('Elasticsearch circuit breaker is open - failing fast');
                }

                if (prop === 'close') {
                    circuitBreaker.destroy();
                }

                return await originalMethod.apply(targetClient, args);
            };
        }
    });
}

export const client = withCircuitBreaker(rawClient);
