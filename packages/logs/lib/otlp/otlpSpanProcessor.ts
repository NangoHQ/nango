import type { ReadableSpan, Span, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import type { Attributes, Context } from '@opentelemetry/api';
import { stringToHash, stringifyError } from '@nangohq/utils';
import { logger } from '../utils.js';
import { otlpRoutingAttributeKey } from './otlp.js';
import type { RouteConfig } from './otlp.js';

interface BatchSpanProcessorWithRouteHash {
    processor: BatchSpanProcessor;
    routeHash: number;
}

class LoggingSpanExporter implements SpanExporter {
    private routeConfig: RouteConfig;
    private exporter: OTLPTraceExporter;

    constructor({ exporter, routeConfig }: { exporter: OTLPTraceExporter; routeConfig: RouteConfig }) {
        this.exporter = exporter;
        this.routeConfig = routeConfig;
    }

    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        const cb = (result: ExportResult) => {
            if (result.code !== 0) {
                logger.error('OTLP export failed', {
                    error: result.error,
                    routingId: this.routeConfig.routingId,
                    endpoint: this.routeConfig.routingEndpoint
                });
            }
            resultCallback(result);
        };
        this.exporter.export(spans, cb);
    }

    shutdown(): Promise<void> {
        return this.exporter.shutdown();
    }

    forceFlush?(): Promise<void> {
        return this.exporter.forceFlush();
    }
}

export class RoutingSpanProcessor implements SpanProcessor {
    private processors = new Map<string, BatchSpanProcessorWithRouteHash>();

    constructor(routes: RouteConfig[]) {
        try {
            for (const route of routes) {
                const exporter = this.newExporter(route);
                const processor = new BatchSpanProcessor(exporter);
                const routeHash = stringToHash(JSON.stringify(route));
                this.processors.set(route.routingId, { processor, routeHash: routeHash });
            }
        } catch (err) {
            logger.error(`failed_to_created_routing_span_processor ${stringifyError(err)}`);
        }
    }

    async updateRoutes(routes: RouteConfig[]) {
        try {
            const toShutdown: BatchSpanProcessor[] = [];

            for (const route of routes) {
                const routeHash = stringToHash(JSON.stringify(route));
                const existing = this.processors.get(route.routingId);
                if (existing) {
                    // Skip if the route hasn't changed
                    if (existing.routeHash === routeHash) {
                        continue;
                    }
                    toShutdown.push(existing.processor);
                }
                const exporter = this.newExporter(route);
                const newProcessor = new BatchSpanProcessor(exporter);
                this.processors.set(route.routingId, { processor: newProcessor, routeHash: routeHash });
            }

            // remove processors that are no longer needed
            for (const [routingId, processor] of this.processors) {
                if (!routes.find((r) => r.routingId === routingId)) {
                    toShutdown.push(processor.processor);
                    this.processors.delete(routingId);
                }
            }

            // Shutdown old processors
            await Promise.all(toShutdown.map((p) => p.shutdown()));
        } catch (err) {
            logger.error(`failed_to_update_routing_span_processor ${stringifyError(err)}`);
        }
    }

    private newExporter(route: RouteConfig): SpanExporter {
        return new LoggingSpanExporter({
            routeConfig: route,
            exporter: new OTLPTraceExporter({
                url: `${route.routingEndpoint}/traces`,
                headers: route.routingHeaders
            })
        });
    }

    private getProcessorForSpan(span: { attributes: Attributes }): BatchSpanProcessor | undefined {
        const routingId = span.attributes[otlpRoutingAttributeKey];
        if (routingId && typeof routingId === 'string') {
            return this.processors.get(routingId)?.processor;
        }
        return undefined;
    }

    onStart(span: Span, context: Context): void {
        try {
            const processor = this.getProcessorForSpan(span);
            if (processor) {
                processor.onStart(span, context);
            }
        } catch (err) {
            logger.error(`failed_to_start_span ${stringifyError(err)}`);
        }
    }

    onEnd(span: ReadableSpan): void {
        try {
            const processor = this.getProcessorForSpan(span);
            if (processor) {
                span.spanContext();
                if (span.attributes[otlpRoutingAttributeKey]) {
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete span.attributes[otlpRoutingAttributeKey];
                }
                processor.onEnd(span);
            }
        } catch (err) {
            logger.error(`failed_to_end_span ${stringifyError(err)}`);
        }
    }

    async shutdown(): Promise<void> {
        try {
            const shutdownPromises = Array.from(this.processors.values()).map((p) => p.processor.shutdown());
            await Promise.all(shutdownPromises);
        } catch (err) {
            logger.error(`failed_to_shutdown_routing_span_processor ${stringifyError(err)}`);
        }
    }
    async forceFlush(): Promise<void> {
        try {
            const flushPromises = Array.from(this.processors.values()).map((p) => p.processor.forceFlush());
            await Promise.all(flushPromises);
        } catch (err) {
            logger.error(`failed_to_flush_routing_span_processor ${stringifyError(err)}`);
        }
    }
}
