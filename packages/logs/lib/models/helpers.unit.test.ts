import { describe, expect, it } from 'vitest';

import { indexOperations } from '../es/schema.js';
import { getFullIndexName, getOperationUpdateIndex } from './helpers.js';

describe('getOperationUpdateIndex', () => {
    const createdAt = '2026-09-28T10:00:00.000Z';

    it('should target the daily index for hosted providers', () => {
        const daily = getFullIndexName(indexOperations.index, createdAt);
        expect(getOperationUpdateIndex(createdAt, 'elasticsearch')).toBe(daily);
        expect(getOperationUpdateIndex(createdAt, 'opensearch')).toBe(daily);
    });

    it('should target the data stream for ec-serverless', () => {
        expect(getOperationUpdateIndex(createdAt, 'ec-serverless')).toBe(indexOperations.index);
    });
});
