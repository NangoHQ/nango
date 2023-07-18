import { expect, describe, it } from 'vitest';
import * as NangoConfigService from './nango-config.service.js';

describe('Nango Config Interval tests', () => {
    it('throws error when interval is less than 5 minutes', async () => {
        expect(() => NangoConfigService.getInterval('every 4m', new Date())).toThrow('interval must be greater than 5 minutes');
    });
    it('Can parse every half day', async () => {
        const date = new Date('2023-07-18T00:00:00');
        expect(NangoConfigService.getInterval('every half day', date)).toEqual({ interval: '12h', offset: 0 });
        const tenMinutes = new Date('2023-07-18T00:10:00');
        expect(NangoConfigService.getInterval('every half day', tenMinutes)).toEqual({ interval: '12h', offset: 600000 });
    });
    it('Can parse every 1.5 hours', async () => {
        const date = new Date('2023-07-18T00:00:00');
        expect(NangoConfigService.getInterval('every 1.5 hours', date)).toEqual({ interval: '1.5 hours', offset: 0 });
    });
});
