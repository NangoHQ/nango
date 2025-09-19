import { describe, expect, it } from 'vitest';

import { getFrequencyMs } from './frequency.js';

describe('getFrequencyMs', () => {
    describe('predefined frequency strings', () => {
        it('should convert "every half day" to 12 hours in milliseconds', () => {
            const result = getFrequencyMs('every half day');
            expect(result.unwrap()).toBe(12 * 60 * 60 * 1000); // 12 hours
        });

        it('should convert "every half hour" to 30 minutes in milliseconds', () => {
            const result = getFrequencyMs('every half hour');
            expect(result.unwrap()).toBe(30 * 60 * 1000); // 30 minutes
        });

        it('should convert "every quarter hour" to 15 minutes in milliseconds', () => {
            const result = getFrequencyMs('every quarter hour');
            expect(result.unwrap()).toBe(15 * 60 * 1000); // 15 minutes
        });

        it('should convert "every hour" to 1 hour in milliseconds', () => {
            const result = getFrequencyMs('every hour');
            expect(result.unwrap()).toBe(60 * 60 * 1000); // 1 hour
        });

        it('should convert "every day" to 24 hours in milliseconds', () => {
            const result = getFrequencyMs('every day');
            expect(result.unwrap()).toBe(24 * 60 * 60 * 1000); // 24 hours
        });

        it('should convert "every month" to 30 days in milliseconds', () => {
            const result = getFrequencyMs('every month');
            expect(result.unwrap()).toBe(30 * 24 * 60 * 60 * 1000); // 30 days
        });

        it('should convert "every week" to 7 days in milliseconds', () => {
            const result = getFrequencyMs('every week');
            expect(result.unwrap()).toBe(7 * 24 * 60 * 60 * 1000); // 7 days
        });
    });

    describe('custom frequency strings with "every" prefix', () => {
        it('should strip "every " prefix and parse custom intervals', () => {
            const result = getFrequencyMs('every 5m');
            expect(result.unwrap()).toBe(5 * 60 * 1000); // 5 minutes
        });

        it('should handle "every 2h" format', () => {
            const result = getFrequencyMs('every 2h');
            expect(result.unwrap()).toBe(2 * 60 * 60 * 1000); // 2 hours
        });

        it('should handle "every 3d" format', () => {
            const result = getFrequencyMs('every 3d');
            expect(result.unwrap()).toBe(3 * 24 * 60 * 60 * 1000); // 3 days
        });
    });

    describe('direct time intervals', () => {
        it('should parse minute intervals', () => {
            const result = getFrequencyMs('10m');
            expect(result.unwrap()).toBe(10 * 60 * 1000); // 10 minutes
        });

        it('should parse hour intervals', () => {
            const result = getFrequencyMs('4h');
            expect(result.unwrap()).toBe(4 * 60 * 60 * 1000); // 4 hours
        });

        it('should parse day intervals', () => {
            const result = getFrequencyMs('2d');
            expect(result.unwrap()).toBe(2 * 24 * 60 * 60 * 1000); // 2 days
        });

        it('should parse second intervals', () => {
            const result = getFrequencyMs('30s');
            expect(result.unwrap()).toBe(30 * 1000); // 30 seconds
        });

        it('should parse millisecond intervals', () => {
            const result = getFrequencyMs('500ms');
            expect(result.unwrap()).toBe(500); // 500 milliseconds
        });

        it('should parse week intervals', () => {
            const result = getFrequencyMs('2w');
            expect(result.unwrap()).toBe(2 * 7 * 24 * 60 * 60 * 1000); // 2 weeks
        });

        it('should handle negative values', () => {
            const result = getFrequencyMs('-5m');
            expect(result.unwrap()).toBe(-5 * 60 * 1000); // -5 minutes
        });

        it('should handle decimal values', () => {
            const result = getFrequencyMs('1.5h');
            expect(result.unwrap()).toBe(1.5 * 60 * 60 * 1000); // 1.5 hours
        });

        it('should handle zero values', () => {
            const result = getFrequencyMs('0m');
            expect(result.unwrap()).toBe(0);
        });

        it('should handle extra whitespace', () => {
            const result = getFrequencyMs('  1ms  ');
            expect(result.unwrap()).toBe(1); // 1ms
        });
    });

    describe('invalid inputs', () => {
        it('should return error for empty string', () => {
            const result = getFrequencyMs('');
            expect(result.unwrap).toThrowError('invalid_interval');
        });

        it('should return error for invalid format', () => {
            const result = getFrequencyMs('invalid format');
            expect(result.unwrap).toThrowError('invalid_interval');
        });

        it('should return error for non-numeric values', () => {
            const result = getFrequencyMs('abc minutes');
            expect(result.unwrap).toThrowError('invalid_interval');
        });

        it('should return error for unsupported units', () => {
            const result = getFrequencyMs('5xyz');
            expect(result.unwrap).toThrowError('invalid_interval');
        });

        it('should return error for unrecognized predefined frequency', () => {
            const result = getFrequencyMs('every unknown period');
            expect(result.unwrap).toThrowError('invalid_interval');
        });
        it('should handle case sensitivity for predefined frequencies', () => {
            const result = getFrequencyMs('Every Hour');
            expect(result.unwrap).toThrowError('invalid_interval');
        });
    });
});
