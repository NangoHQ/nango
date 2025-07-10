import { setTimeout } from 'node:timers/promises';

import { trace } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

import { once, stringifyError } from '@nangohq/utils';

import { logger } from '../utils.js';
import { RoutingSpanProcessor } from './otlpSpanProcessor.js';

import type { Tracer } from '@opentelemetry/api';

// Enable OpenTelemetry console logging
// import { DiagLogLevel, DiagConsoleLogger, diag } from '@opentelemetry/api';
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

export const otlpRoutingAttributeKey = 'otlp.internal.routingKey';

export interface RouteConfig {
    routingId: string;
    routingEndpoint: string;
    routingHeaders: Record<string, string>;
}

let routingProcessor: RoutingSpanProcessor | null = null;
process.on('SIGTERM', async () => {
    if (routingProcessor) {
        await routingProcessor.shutdown();
    }
});

function registerRoutes(routes: RouteConfig[]) {
    try {
        if (routingProcessor) {
            routingProcessor.updateRoutes(routes);
        } else {
            routingProcessor = new RoutingSpanProcessor(routes);
            const provider = new NodeTracerProvider({
                resource: new Resource({ [ATTR_SERVICE_NAME]: 'nango-otlp' })
            });
            provider.addSpanProcessor(routingProcessor);
            provider.register();
        }
    } catch (err) {
        logger.error(`failed_to_register_otlp_routes ${stringifyError(err)}`);
    }
}

async function updateRoutes(getRoutes: () => Promise<RouteConfig[]>) {
    try {
        const routes = await getRoutes();
        registerRoutes(routes);
    } catch (err) {
        logger.error(`failed_to_update_otlp_routes ${stringifyError(err)}`);
    }
}

export const otlp: {
    running: AbortController | false;
    register: (getRoutes: () => Promise<RouteConfig[]>) => Promise<void>;
    stop: () => void;
    tracer: Tracer;
    routingAttributeKey: string;
} = {
    running: false,
    register: once(async (getRoutes) => {
        otlp.running = new AbortController();
        while (otlp.running) {
            await updateRoutes(getRoutes);
            try {
                await setTimeout(15000, null, { signal: otlp.running.signal });
            } catch {
                break;
            }
        }
    }),
    stop: () => {
        if (otlp.running) {
            otlp.running.abort();
            otlp.running = false;
        }
    },
    tracer: trace.getTracer('nango-otlp'),
    routingAttributeKey: 'otlp.internal.routingKey'
};
