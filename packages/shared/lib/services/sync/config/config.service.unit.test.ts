import { describe, expect, it } from 'vitest';

import * as SyncConfigService from './config.service.js';

describe('Sync config increment', () => {
    it('should increment a number', () => {
        expect(SyncConfigService.increment(1).unwrap()).toBe('2');
        expect(SyncConfigService.increment(0).unwrap()).toBe('1');
        expect(SyncConfigService.increment(9).unwrap()).toBe('10');
    });

    it('should increment a string number', () => {
        expect(SyncConfigService.increment('1').unwrap()).toBe('2');
        expect(SyncConfigService.increment('0').unwrap()).toBe('1');
        expect(SyncConfigService.increment('999').unwrap()).toBe('1000');
    });

    it('should increment version string', () => {
        expect(SyncConfigService.increment('1.9.9').unwrap()).toBe('1.9.10');
        expect(SyncConfigService.increment('1.0.9').unwrap()).toBe('1.0.10');
        expect(SyncConfigService.increment('1.1.1').unwrap()).toBe('1.1.2');
        expect(SyncConfigService.increment('1.1.9').unwrap()).toBe('1.1.10');
        expect(SyncConfigService.increment('1.1.9999').unwrap()).toBe('1.1.10000');
        expect(SyncConfigService.increment('1.9.9').unwrap()).toBe('1.9.10');
        expect(SyncConfigService.increment('99.2.2').unwrap()).toBe('99.2.3');
        expect(SyncConfigService.increment('9.9.9').unwrap()).toBe('9.9.10');
    });

    it('should return an error on invalid version segment', () => {
        expect(SyncConfigService.increment('1.1.a').isErr()).toBe(true);
        expect(() => SyncConfigService.increment('1.1.a').unwrap()).toThrowError('Invalid version string: 1.1.a');
        expect(() => SyncConfigService.increment('a.b.c').unwrap()).toThrowError('Invalid version string: a.b.c');
    });

    it('should return an error on a non-numeric, non-dotted version string (e.g. a git SHA)', () => {
        expect(() => SyncConfigService.increment('f4a9c21').unwrap()).toThrowError('Invalid version string segment: f4a9c21');
    });

    it('should return an error on invalid input', () => {
        expect(() => SyncConfigService.increment({} as unknown as string).unwrap()).toThrowError('Invalid version input: [object Object]');
        expect(() => SyncConfigService.increment(undefined as unknown as string).unwrap()).toThrowError('Invalid version input: undefined');
    });
});
