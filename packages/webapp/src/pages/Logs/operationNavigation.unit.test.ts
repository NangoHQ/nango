// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { navigationDirection, neighbourId } from './operationNavigation';

describe('neighbourId', () => {
    const ids = ['a', 'b', 'c'];

    it('returns the next and previous id', () => {
        expect(neighbourId(ids, 'b', 'next')).toBe('c');
        expect(neighbourId(ids, 'b', 'previous')).toBe('a');
    });

    it('returns null at either end', () => {
        expect(neighbourId(ids, 'c', 'next')).toBeNull();
        expect(neighbourId(ids, 'a', 'previous')).toBeNull();
    });

    it('returns null when the current id is not in the list', () => {
        expect(neighbourId(ids, 'z', 'next')).toBeNull();
    });
});

describe('navigationDirection', () => {
    const event = (key: string, target: EventTarget | null = document.body, extra: Partial<KeyboardEvent> = {}) => ({
        key,
        target,
        defaultPrevented: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        ...extra
    });

    it('maps arrows and j/k', () => {
        expect(navigationDirection(event('ArrowUp'))).toBe('previous');
        expect(navigationDirection(event('k'))).toBe('previous');
        expect(navigationDirection(event('ArrowDown'))).toBe('next');
        expect(navigationDirection(event('j'))).toBe('next');
        expect(navigationDirection(event('x'))).toBeNull();
    });

    it('ignores keys with a modifier or already handled', () => {
        expect(navigationDirection(event('j', document.body, { metaKey: true }))).toBeNull();
        expect(navigationDirection(event('j', document.body, { shiftKey: true }))).toBeNull();
        expect(navigationDirection(event('j', document.body, { defaultPrevented: true }))).toBeNull();
    });

    it('ignores keys typed into a field or a menu', () => {
        const input = document.createElement('input');
        expect(navigationDirection(event('j', input))).toBeNull();

        const listbox = document.createElement('div');
        listbox.setAttribute('role', 'listbox');
        const option = document.createElement('div');
        listbox.appendChild(option);
        expect(navigationDirection(event('ArrowDown', option))).toBeNull();

        const logList = document.createElement('div');
        logList.setAttribute('data-owns-arrow-keys', '');
        const row = document.createElement('button');
        logList.appendChild(row);
        expect(navigationDirection(event('ArrowDown', row))).toBeNull();
        expect(navigationDirection(event('j', row))).toBe('next');
    });
});
