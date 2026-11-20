import { describe, expect, it } from 'vitest';

import { exitCode, parseSlot, slotEnv } from './dev-slot.mjs';

describe('exitCode', () => {
    it('treats a stop signal as a clean exit', () => {
        expect(exitCode(null, 'SIGINT')).toBe(0);
        expect(exitCode(null, 'SIGTERM')).toBe(0);
    });

    it('fails when the child crashes on any other signal', () => {
        expect(exitCode(null, 'SIGKILL')).toBe(1);
        expect(exitCode(null, 'SIGSEGV')).toBe(1);
    });

    it('passes through the child exit code', () => {
        expect(exitCode(0, null)).toBe(0);
        expect(exitCode(2, null)).toBe(2);
    });
});

describe('parseSlot', () => {
    it('treats an unset slot as slot 0', () => {
        expect(parseSlot(undefined)).toBe(0);
        expect(parseSlot('')).toBe(0);
    });

    it('rejects slots outside 0-9', () => {
        expect(() => parseSlot('10')).toThrow();
        expect(() => parseSlot('-1')).toThrow();
        expect(() => parseSlot('1.5')).toThrow();
        expect(() => parseSlot('one')).toThrow();
    });
});

describe('slotEnv', () => {
    it('changes nothing for slot 0', () => {
        expect(slotEnv(0, { NANGO_PUBLIC_SERVER_URL: 'http://localhost:3000' })).toEqual({});
    });

    it('moves every port and URL to the slot block', () => {
        expect(slotEnv(2)).toEqual({
            NANGO_WEBAPP_PORT: '3200',
            SERVER_PORT: '3203',
            NANGO_JOBS_PORT: '3205',
            NANGO_PERSIST_PORT: '3207',
            NANGO_ORCHESTRATOR_PORT: '3208',
            NANGO_CONNECT_UI_PORT: '3209',
            NANGO_SERVER_URL: 'http://localhost:3203',
            JOBS_SERVICE_URL: 'http://localhost:3205',
            PERSIST_SERVICE_URL: 'http://localhost:3207',
            ORCHESTRATOR_SERVICE_URL: 'http://localhost:3208',
            NANGO_PUBLIC_CONNECT_URL: 'http://localhost:3209'
        });
    });

    it('moves any localhost URL on a slot-0 port to the block', () => {
        const env = slotEnv(1, {
            NANGO_PUBLIC_SERVER_URL: 'http://localhost:3000/',
            NANGO_DASHBOARD_API_URL: 'http://127.0.0.1:3003',
            PROVIDERS_URL: 'http://localhost:3003/providers.json'
        });
        expect(env['NANGO_PUBLIC_SERVER_URL']).toBe('http://localhost:3100/');
        expect(env['NANGO_DASHBOARD_API_URL']).toBe('http://127.0.0.1:3103');
        expect(env['PROVIDERS_URL']).toBe('http://localhost:3103/providers.json');
    });

    it('leaves other URLs alone', () => {
        const env = slotEnv(1, {
            NANGO_PUBLIC_SERVER_URL: 'https://nango.example.com',
            NANGO_LOGS_ES_URL: 'http://localhost:9500',
            NANGO_DATABASE_URL: 'http://localhost:30001'
        });
        expect(env).not.toHaveProperty('NANGO_PUBLIC_SERVER_URL');
        expect(env).not.toHaveProperty('NANGO_LOGS_ES_URL');
        expect(env).not.toHaveProperty('NANGO_DATABASE_URL');
    });

    it('lets the slot ports win over a slot-0 URL from .env', () => {
        expect(slotEnv(1, { NANGO_SERVER_URL: 'http://localhost:3003' })['NANGO_SERVER_URL']).toBe('http://localhost:3103');
    });
});
