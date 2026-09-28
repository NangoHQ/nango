import { describe, expect, it } from 'vitest';

import { getLogsIngestPipelineId, getServerlessIndexTemplate, getTimestampPipeline, indexMessages, indexOperations, retentionMinAge } from './schema.js';

describe('ec-serverless index template', () => {
    it('should build a data stream template with retention and no ILM settings', () => {
        const template = getServerlessIndexTemplate(indexOperations);

        expect(template.name).toBe(`${indexOperations.index}-template`);
        expect(template.index_patterns).toBe(indexOperations.index);
        expect(template.data_stream).toEqual({});
        expect(template.template.aliases).toBeUndefined();
        expect(template.template.lifecycle).toEqual({ data_retention: retentionMinAge });
        expect(template.template.settings).toEqual({
            analysis: {
                analyzer: {
                    default: { type: 'standard' },
                    default_search: { type: 'standard' }
                }
            },
            index: {
                'sort.field': ['createdAt', 'id'],
                'sort.order': ['desc', 'desc']
            }
        });
        expect(template.template.settings).not.toHaveProperty('number_of_shards');
        expect(template.template.settings).not.toHaveProperty('lifecycle');

        const mappings = template.template.mappings as {
            _source: { enabled: boolean; excludes: string[] };
            dynamic: false;
            properties: Record<string, { type: string }>;
        };
        expect(mappings._source).toEqual({ enabled: true, excludes: ['@timestamp'] });
        expect(mappings.dynamic).toBe(false);
        expect(mappings.properties['@timestamp']).toEqual({ type: 'date' });
        expect(mappings.properties['id']).toEqual({ type: 'keyword' });
    });

    it('should keep message fields and add @timestamp', () => {
        const template = getServerlessIndexTemplate(indexMessages);
        const properties = (template.template.mappings as { properties: Record<string, unknown> }).properties;
        expect(properties['@timestamp']).toEqual({ type: 'date' });
        expect(properties['createdAt']).toEqual({ type: 'date' });
    });
});

describe('logs ingest pipeline', () => {
    it('should copy createdAt onto @timestamp', () => {
        expect(getTimestampPipeline('20240528_messages')).toEqual({
            id: 'timestamp.20240528_messages',
            description: 'Copy createdAt to @timestamp for data stream lifecycle',
            processors: [{ set: { field: '@timestamp', copy_from: 'createdAt' } }]
        });
    });

    it('should use the daily pipeline unless the provider is ec-serverless', () => {
        expect(getLogsIngestPipelineId('operations')).toBe('daily.operations');
        expect(getLogsIngestPipelineId('operations', 'elasticsearch')).toBe('daily.operations');
        expect(getLogsIngestPipelineId('operations', 'opensearch')).toBe('daily.operations');
        expect(getLogsIngestPipelineId('operations', 'ec-serverless')).toBe('timestamp.operations');
    });
});
