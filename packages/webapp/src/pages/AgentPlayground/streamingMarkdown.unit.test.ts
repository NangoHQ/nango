import { describe, expect, it } from 'vitest';

import { hideTrailingLink } from './streamingMarkdown.js';

describe('hideTrailingLink', () => {
    it('shows the text of a link whose URL is still streaming', () => {
        expect(hideTrailingLink('See [Lunch time](https://calendar.google.com/ev')).toBe('See Lunch time');
    });

    it('shows the text of a link whose text is still streaming', () => {
        expect(hideTrailingLink('See [Lunch ti')).toBe('See Lunch ti');
        expect(hideTrailingLink('See [Lunch time]')).toBe('See Lunch time');
        expect(hideTrailingLink('See [Lunch time](')).toBe('See Lunch time');
    });

    it('leaves finished links alone', () => {
        expect(hideTrailingLink('See [Lunch time](https://example.com) at noon')).toBe('See [Lunch time](https://example.com) at noon');
        expect(hideTrailingLink('See [Lunch time](https://example.com)')).toBe('See [Lunch time](https://example.com)');
    });

    it('leaves text without links alone', () => {
        expect(hideTrailingLink('You have one event today')).toBe('You have one event today');
    });
});
