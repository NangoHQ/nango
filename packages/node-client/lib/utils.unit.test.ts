import { describe, expect, it } from 'vitest';
import { getUserAgent } from './utils.js';

const regex = 'nango-node-client/[0-9.]+ .[a-z]+/[0-9a-z.-]+; node.js/[0-9.]+.';
describe('getUserAgent', () => {
    it('should output default user agent', () => {
        expect(getUserAgent()).toMatch(new RegExp(regex));
    });
    it('should output additional user agent ', () => {
        expect(getUserAgent('cli')).toMatch(new RegExp(`${regex}; cli`));
    });
});
