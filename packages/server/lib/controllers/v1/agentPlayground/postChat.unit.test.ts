import { describe, expect, it } from 'vitest';

import { isTimeZone } from './postChat.js';

describe('isTimeZone', () => {
    it.each(['Europe/Prague', 'Asia/Kolkata', 'Europe/Kyiv', 'Asia/Ho_Chi_Minh', 'Etc/UTC', 'UTC'])('accepts %s', (timeZone) => {
        expect(isTimeZone(timeZone)).toBe(true);
    });

    it('rejects a name that is not a time zone', () => {
        expect(isTimeZone('Not/AZone')).toBe(false);
    });
});
