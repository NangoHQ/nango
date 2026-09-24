import { describe, expect, it } from 'vitest';

import { recordModelName } from './model.js';

describe('recordModelName', () => {
    it('leaves the base variant out of the name', () => {
        expect(recordModelName('Email', 'base')).toBe('Email');
    });

    it('appends any other variant', () => {
        expect(recordModelName('Email', 'inbox')).toBe('Email::inbox');
    });

    it('treats a missing variant as base', () => {
        expect(recordModelName('Email')).toBe('Email');
        expect(recordModelName('Email', null)).toBe('Email');
        expect(recordModelName('Email', '')).toBe('Email');
    });
});
