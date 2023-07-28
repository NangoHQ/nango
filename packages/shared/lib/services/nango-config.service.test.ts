import { expect, describe, it } from 'vitest';
import * as NangoConfigService from './nango-config.service.js';

describe('Nango Config Interval tests', () => {
    it('throws error when interval is less than 5 minutes', async () => {
        const { success, error } = NangoConfigService.getInterval('every 4m', new Date());
        expect(success).toBe(false);
        expect(error?.message).toBe('Sync interval is too short. The minimum interval is 5 minutes.');
    });
    it('Can parse every half day', async () => {
        const date = new Date('2023-07-18T00:00:00');
        let { success, error, response } = NangoConfigService.getInterval('every half day', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '12h', offset: 0 });

        const tenMinutes = new Date('2023-07-18T00:10:00');
        ({ success, error, response } = NangoConfigService.getInterval('every half day', tenMinutes));
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '12h', offset: 600000 });
    });
    it('Can parse every 1.5 hours', async () => {
        const date = new Date('2023-07-18T00:00:00');
        const { success, error, response } = NangoConfigService.getInterval('every 1.5 hours', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '1.5 hours', offset: 0 });
    });
    it('Can parse every day', async () => {
        const date = new Date('2023-07-18T00:00:00');
        const { success, error, response } = NangoConfigService.getInterval('every day', date);
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response).toEqual({ interval: '1d', offset: 0 });
    });
});
