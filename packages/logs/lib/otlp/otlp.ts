import { trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { once, stringifyError } from '@nangohq/utils';
import { logger } from '../utils.js';
import { RoutingSpanProcessor } from './otlpSpanProcessor.js';
import { setInterval } from 'timers';

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
            const provider = new NodeTracerProvider({ resource: new Resource({ [ATTR_SERVICE_NAME]: 'nango-otlp' }) });
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

export const otlp = {
    register: once(async (getRoutes: () => Promise<RouteConfig[]>) => {
        await updateRoutes(getRoutes);
        setInterval(async () => await updateRoutes(getRoutes), 10000);
    }),
    tracer: trace.getTracer('nango-otlp'),
    routingAttributeKey: 'otlp.internal.routingKey'
};
