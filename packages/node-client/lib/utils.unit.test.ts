import { describe, expect, it } from 'vitest';
import { getUserAgent } from './utils.js';

describe('getUserAgent', () => {
    it('should output default user agent', () => {
        expect(getUserAgent()).toMatch(/nango-node-client\/[0-9.]+ [a-z]+.[0-9.]+; Node.js 20.12.2/);
    });
    it('should output additional user agent ', () => {
        expect(getUserAgent('cli')).toMatch(/nango-node-client\/[0-9.]+ [a-z]+.[0-9.]+; Node.js 20.12.2; cli/);
    });
});
