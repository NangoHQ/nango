import { describe, expect, it } from 'vitest';

import * as SyncConfigService from './config.service.js';

describe('Sync config increment', () => {
    it('should increment a number', () => {
        expect(SyncConfigService.increment(1)).toBe(2);
        expect(SyncConfigService.increment(0)).toBe(1);
        expect(SyncConfigService.increment(9)).toBe(10);
    });

    it('should increment a string number', () => {
        expect(SyncConfigService.increment('1')).toBe('2');
        expect(SyncConfigService.increment('0')).toBe('1');
        expect(SyncConfigService.increment('999')).toBe('1000');
    });

    it('should increment version string', () => {
        expect(SyncConfigService.increment('1.9.9')).toBe('1.9.10');
        expect(SyncConfigService.increment('1.0.9')).toBe('1.0.10');
        expect(SyncConfigService.increment('1.1.1')).toBe('1.1.2');
        expect(SyncConfigService.increment('1.1.9')).toBe('1.1.10');
        expect(SyncConfigService.increment('1.1.9999')).toBe('1.1.10000');
        expect(SyncConfigService.increment('1.9.9')).toBe('1.9.10');
        expect(SyncConfigService.increment('99.2.2')).toBe('99.2.3');
        expect(SyncConfigService.increment('9.9.9')).toBe('9.9.10');
    });

    it('should throw error on invalid version segment', () => {
        expect(() => SyncConfigService.increment('1.1.a')).toThrowError('Invalid version string: 1.1.a');
        expect(() => SyncConfigService.increment('a.b.c')).toThrowError('Invalid version string: a.b.c');
    });

    it('should throw error on invalid input', () => {
        expect(() => SyncConfigService.increment({} as unknown as string)).toThrowError('Invalid version input: [object Object]');
        expect(() => SyncConfigService.increment(undefined as unknown as string)).toThrowError('Invalid version input: undefined');
    });
});
