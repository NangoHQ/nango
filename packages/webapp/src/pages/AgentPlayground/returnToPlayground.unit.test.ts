import { describe, expect, it } from 'vitest';

import { returnsToPlayground, returnToPlaygroundState } from './returnToPlayground';

describe('returnsToPlayground', () => {
    it('is true for the state the playground sets', () => {
        expect(returnsToPlayground(returnToPlaygroundState())).toBe(true);
    });

    it('is false for no state or any other state', () => {
        expect(returnsToPlayground(null)).toBe(false);
        expect(returnsToPlayground(undefined)).toBe(false);
        expect(returnsToPlayground({ draft: 'hi' })).toBe(false);
        expect(returnsToPlayground({ returnToPlayground: 'yes' })).toBe(false);
    });
});
