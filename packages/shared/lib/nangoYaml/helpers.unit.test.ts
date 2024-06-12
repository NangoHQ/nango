import { expect, describe, it } from 'vitest';
import { getInterval } from './helpers.js';

describe('Nango Config Interval tests', () => {
    it('throws error when interval is less than 5 minutes', () => {
        const { success, error } = getInterval('every 4m', new Date());
        expect(success).toBe(false);
        expect(error?.message).toBe('Sync interval is too short. The minimum interval is 5 minutes.');
    });

    it('Can parse every half day', () => {
        const date = new Date('2023-07-18T00:00:00');
        let { success, error, response } = getInterval('every half day', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '12h', offset: 0 });

        const tenMinutes = new Date('2023-07-18T00:10:00');
        ({ success, error, response } = getInterval('every half day', tenMinutes));
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '12h', offset: 600000 });
    });

    it('Can parse every 1.5 hours', () => {
        const date = new Date('2023-07-18T00:00:00');
        const { success, error, response } = getInterval('every 1.5 hours', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '1.5 hours', offset: 0 });
    });

    it('Can parse every day', () => {
        const date = new Date('2023-07-18T00:00:00');
        const { success, error, response } = getInterval('every day', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '1d', offset: 0 });
    });

    it('Can parse every 5 minutes', () => {
        const date = new Date('2023-07-18T00:00:00');
        const { success, error, response } = getInterval('every 5m', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '5m', offset: 0 });
    });

    it('Can parse every 10 minutes', () => {
        const date = new Date('2023-07-18T00:00:00');
        const { success, error, response } = getInterval('every 10m', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '10m', offset: 0 });
    });

    it('Can parse every week', () => {
        const date = new Date('2023-07-18T00:00:00');
        const { success, error, response } = getInterval('every week', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '1w', offset: 0 });
    });

    it('Can parse every month', () => {
        const date = new Date('2023-07-18T00:00:00');
        const { success, error, response } = getInterval('every month', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '30d', offset: 0 });
    });

    it('Returns error for unsupported interval format', () => {
        const date = new Date('2023-07-18T00:00:00');
        const { success, error } = getInterval('every yearasdad', date);
        expect(success).toBe(false);
        expect(error?.message).toBe('Sync interval is invalid. The interval should be a time unit.');
    });

    it('Can parse intervals with different starting offset', () => {
        const date = new Date('2023-07-18T12:30:00');
        const { success, error, response } = getInterval('every 1h', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '1h', offset: 1800000 });
    });

    it('Gives back a correct offset', () => {
        const date = new Date('2023-07-18T12:30:00');
        const { success, error, response } = getInterval('every 1h', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '1h', offset: 1800000 });
    });

    it('Gives back a correct offset with 5 after with an interval of 30 minutes', () => {
        const date = new Date('2023-07-18T12:35:00');
        const { success, error, response } = getInterval('every 30m', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '30m', offset: 300000 }); // 300000 is 5 minutes
    });
});
