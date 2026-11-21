import { describe, expect, it } from 'vitest';

import { isNodeSubject, isTaskSubject } from './principals.js';

describe('isTaskSubject', () => {
    it('accepts a task id suffix', () => {
        expect(isTaskSubject('task:11111111-1111-4111-8111-111111111111')).toBe(true);
    });

    it('rejects an empty suffix, undefined, and a non-prefixed value', () => {
        expect(isTaskSubject('task:')).toBe(false);
        expect(isTaskSubject(undefined)).toBe(false);
        expect(isTaskSubject('node:1')).toBe(false);
        expect(isTaskSubject('service:jobs')).toBe(false);
    });
});

describe('isNodeSubject', () => {
    it('accepts a node id suffix', () => {
        expect(isNodeSubject('node:1')).toBe(true);
    });

    it('rejects an empty suffix, undefined, and a non-prefixed value', () => {
        expect(isNodeSubject('node:')).toBe(false);
        expect(isNodeSubject(undefined)).toBe(false);
        expect(isNodeSubject('task:1')).toBe(false);
    });
});
