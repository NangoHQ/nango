import { describe, expect, it } from 'vitest';

import { toggleExpandedMetric } from './expandedMetrics.js';

describe('toggleExpandedMetric', () => {
    it('appends a metric when opening', () => {
        expect(toggleExpandedMetric([], 'connections', true)).toEqual(['connections']);
        expect(toggleExpandedMetric(['connections'], 'proxy', true)).toEqual(['connections', 'proxy']);
    });

    it('does not duplicate a metric that is already expanded', () => {
        expect(toggleExpandedMetric(['connections', 'proxy'], 'connections', true)).toEqual(['proxy', 'connections']);
    });

    it('removes a metric when closing', () => {
        expect(toggleExpandedMetric(['connections', 'proxy'], 'connections', false)).toEqual(['proxy']);
    });

    it('is a no-op closing a metric that is not expanded', () => {
        expect(toggleExpandedMetric(['proxy'], 'connections', false)).toEqual(['proxy']);
    });
});
