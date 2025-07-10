import { SpanStatusCode } from '@opentelemetry/api';

import { otlp, otlpRoutingAttributeKey } from './otlp.js';
import { envs } from '../env.js';

import type { OperationRow, OperationState } from '@nangohq/types';
import type { Span } from '@opentelemetry/api';

export class OtlpSpan {
    private span: Span | null = null;

    constructor(operation: OperationRow, startTime?: Date) {
        if (!envs.NANGO_LOGS_ENABLED) {
            return;
        }

        // if no environmentId, we cannot route the span to the correct exporter so we don't start it
        if (!operation.environmentId) {
            return;
        }

        const attributes: Record<string, any> = {
            [otlpRoutingAttributeKey]: `environment:${operation.environmentId}`,
            'nango.operation.id': operation.id,
            'nango.operation.type': operation.operation.type,
            'nango.operation.action': operation.operation.action,
            'nango.operation.message': operation.message,
            'nango.account': operation.accountName
        };
        if (operation.environmentName) {
            attributes['nango.environment'] = operation.environmentName;
        }
        if (operation.providerName) {
            attributes['nango.provider'] = operation.providerName;
        }
        if (operation.integrationName) {
            attributes['nango.integration'] = operation.integrationName;
        }
        if (operation.connectionName) {
            attributes['nango.connection'] = operation.connectionName;
        }
        if (operation.syncConfigName) {
            attributes['nango.sync'] = operation.syncConfigName;
        }

        const spanName = `nango.${operation.operation.type}.${operation.operation.action}`.toLowerCase();
        this.span = otlp.tracer.startSpan(spanName, { attributes, root: true, startTime: startTime || new Date() });
    }

    fail(err: Error): void {
        if (this.span) {
            this.span.recordException(err);
            this.span.setStatus({ code: SpanStatusCode.ERROR });
        }
    }

    end(state: OperationState): void {
        if (this.span) {
            this.span.setAttribute('nango.operation.status', state);
            this.span.setStatus({ code: ['success', 'waiting', 'running'].includes(state) ? SpanStatusCode.OK : SpanStatusCode.ERROR });
            this.span.end();
        }
    }

    enrich(data: Partial<OperationRow>): void {
        if (this.span) {
            const attrs: Record<string, any> = {};
            if (data.error) {
                attrs['nango.error.message'] = data.error.message;
                if (data.error.type) {
                    attrs['nango.error.type'] = data.error.type;
                }
                if (data.error.payload) {
                    attrs['nango.error.payload'] = data.error.payload;
                }
            }
            if (data.environmentName) {
                attrs['nango.environment'] = data.environmentName;
            }
            if (data.providerName) {
                attrs['nango.provider'] = data.providerName;
            }
            if (data.integrationName) {
                attrs['nango.integration'] = data.integrationName;
            }
            if (data.connectionName) {
                attrs['nango.connection'] = data.connectionName;
            }
            if (data.syncConfigName) {
                attrs['nango.sync'] = data.syncConfigName;
            }
            this.span.setAttributes(attrs);
        }
    }
}
