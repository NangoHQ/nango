import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { getConnectSession } from './getSession.js';

import type * as NangoUtils from '@nangohq/utils';
import type { Request, Response } from 'express';

const { mockGetConnectUISettings, mockGetDefaultConnectUISettings, mockGetWebsocketsPath } = vi.hoisted(() => {
    return {
        mockGetConnectUISettings: vi.fn(),
        mockGetDefaultConnectUISettings: vi.fn(),
        mockGetWebsocketsPath: vi.fn()
    };
});

vi.mock('@nangohq/database', () => ({
    default: { knex: {} }
}));

vi.mock('@nangohq/shared', () => ({
    connectUISettingsService: {
        getConnectUISettings: mockGetConnectUISettings,
        getDefaultConnectUISettings: mockGetDefaultConnectUISettings
    },
    getGlobalWebhookReceiveUrl: () => 'https://api.nango.dev/webhook',
    getWebsocketsPath: mockGetWebsocketsPath
}));

// isCloud is a module-level constant computed from process.env at import time, so it can't be
// flipped with vi.stubEnv once @nangohq/utils has loaded; override it directly here instead.
vi.mock('@nangohq/utils', async () => {
    const actual: typeof NangoUtils = await vi.importActual('@nangohq/utils');

    return {
        ...actual,
        isCloud: true
    };
});

function buildReqRes() {
    const req = {
        query: {},
        body: {},
        route: { path: '/connect/session' },
        originalUrl: '/connect/session',
        header: vi.fn()
    } as unknown as Request;
    const status = vi.fn().mockReturnThis();
    const send = vi.fn().mockReturnThis();
    const res = {
        locals: {
            connectSession: {
                endUserId: null,
                endUser: null,
                tags: { projectId: '123' },
                allowedIntegrations: null,
                integrationsConfigDefaults: null,
                connectionId: null,
                overrides: null
            },
            account: { id: 1 },
            environment: { id: 1, uuid: 'env-uuid' },
            plan: null
        },
        status,
        send
    } as unknown as Response;
    return { req, res, status, send };
}

describe('getConnectSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetConnectUISettings.mockResolvedValue(Ok({ showWatermark: true, defaultTheme: 'system' }));
        mockGetDefaultConnectUISettings.mockReturnValue({ showWatermark: true, defaultTheme: 'system' });
        mockGetWebsocketsPath.mockReturnValue('/ws');
    });

    it('omits websocketsPath on cloud, even if the server has a custom path configured', async () => {
        const { req, res, send } = buildReqRes();

        await getConnectSession(req, res, vi.fn());

        expect(mockGetWebsocketsPath).not.toHaveBeenCalled();
        const sent = send.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined;
        expect(sent?.data['websocketsPath']).toBeUndefined();
    });

    it('forwards collect_app_credentials and the webhook URL to Connect UI', async () => {
        const { req, res, send } = buildReqRes();
        (res.locals['connectSession'] as { integrationsConfigDefaults: unknown }).integrationsConfigDefaults = {
            'github-app': { collect_app_credentials: true },
            'other-app': {}
        };

        await getConnectSession(req, res, vi.fn());

        const sent = send.mock.calls[0]?.[0] as
            | { data: { integrations_config_defaults: Record<string, { collect_app_credentials?: boolean }>; webhook_urls?: Record<string, string> } }
            | undefined;
        expect(sent?.data.integrations_config_defaults['github-app']?.collect_app_credentials).toBe(true);
        expect(sent?.data.webhook_urls).toStrictEqual({ 'github-app': 'https://api.nango.dev/webhook/env-uuid/github-app' });
    });

    it('omits the webhook URLs when no integration collects app credentials', async () => {
        const { req, res, send } = buildReqRes();

        await getConnectSession(req, res, vi.fn());

        const sent = send.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined;
        expect(sent?.data['webhook_urls']).toBeUndefined();
    });
});
