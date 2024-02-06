import { vi, expect, describe, it, beforeEach } from 'vitest';
import axios from 'axios';
import environmentService from '../environment.service.js';
import { SyncType } from '../../models/Sync.js';
import type { RecentlyCreatedConnection } from '../../models/Connection.js';
import WebhookService from './webhook.service.js';
import type { NangoConnection } from '../../models/Connection.js';
import type { Environment } from '../../models/Environment';
import { mockCreateActivityLog } from '../activity/mocks.js';

vi.mock('axios', () => ({
    default: {
        post: vi.fn(() => Promise.resolve({ status: 200 })) // Mock axios.post as a spy
    },
    __esModule: true
}));

describe('Webhook notification tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('Should not send an auth webhook if the webhook url is not present', async () => {
        mockCreateActivityLog();
        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                webhook_url: null
            } as Environment);
        });

        await WebhookService.sendAuthUpdate({ connection_id: 'foo' } as RecentlyCreatedConnection, 'hubspot', true, 1);
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should not send an auth webhook if the webhook url is not present even if the auth webhook is checked', async () => {
        mockCreateActivityLog();
        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                webhook_url: null,
                send_auth_webhook: true
            } as Environment);
        });

        await WebhookService.sendAuthUpdate({ connection_id: 'foo' } as RecentlyCreatedConnection, 'hubspot', false, 1);
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should send an auth webhook if the webhook url is present and if the auth webhook is checked', async () => {
        mockCreateActivityLog();
        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                webhook_url: 'http://example.com/webhook',
                send_auth_webhook: true,
                secret_key: 'secret'
            } as Environment);
        });

        vi.spyOn(environmentService, 'getEnvironmentName').mockImplementation(() => {
            return Promise.resolve('dev');
        });

        await WebhookService.sendAuthUpdate({ connection_id: 'foo' } as RecentlyCreatedConnection, 'hubspot', true, 1);
        expect(axios.post).toHaveBeenCalled();
    });

    it('Should not send an auth webhook if the webhook url is present and if the auth webhook is not checked', async () => {
        mockCreateActivityLog();
        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                webhook_url: 'http://example.com/webhook',
                send_auth_webhook: false,
                secret_key: 'secret'
            } as Environment);
        });

        vi.spyOn(environmentService, 'getEnvironmentName').mockImplementation(() => {
            return Promise.resolve('dev');
        });

        await WebhookService.sendAuthUpdate({ connection_id: 'foo' } as RecentlyCreatedConnection, 'hubspot', true, 1);
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should not send a forward webhook if the webhook url is not present', async () => {
        mockCreateActivityLog();
        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                webhook_url: null
            } as Environment);
        });

        await WebhookService.forward(1, 'providerKey', 'provider', {}, {});
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should send a forwarded webhook if the webhook url is present', async () => {
        mockCreateActivityLog();
        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                webhook_url: 'http://example.com/webhook',
                secret_key: 'secret'
            } as Environment);
        });
        await WebhookService.forward(1, 'providerKey', 'provider', {}, {});
        expect(axios.post).toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is not present', async () => {
        mockCreateActivityLog();
        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                webhook_url: null
            } as Environment);
        });

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
            1
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is not present even if always send is checked', async () => {
        mockCreateActivityLog();
        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                webhook_url: null,
                always_send_webhook: true
            } as Environment);
        });

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
            1
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is present but if always send is not checked and there were no sync changes', async () => {
        mockCreateActivityLog();
        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                webhook_url: 'http://example.com/webhook',
                always_send_webhook: false,
                secret_key: 'secret'
            } as Environment);
        });

        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
            1
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should send a sync webhook if the webhook url is present and if always send is not checked and there were sync changes', async () => {
        mockCreateActivityLog();
        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                webhook_url: 'http://example.com/webhook',
                always_send_webhook: false,
                secret_key: 'secret'
            } as Environment);
        });

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
            1
        );
        expect(axios.post).toHaveBeenCalled();
    });

    it('Should send a sync webhook if the webhook url is present and if always send is checked and there were sync changes', async () => {
        mockCreateActivityLog();
        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                webhook_url: 'http://example.com/webhook',
                always_send_webhook: true,
                secret_key: 'secret'
            } as Environment);
        });

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
            1
        );
        expect(axios.post).toHaveBeenCalled();
    });

    it('Should send an sync webhook if the webhook url is present and if always send is checked and there were no sync changes', async () => {
        mockCreateActivityLog();
        vi.spyOn(environmentService, 'getById').mockImplementation(() => {
            return Promise.resolve({
                webhook_url: 'http://example.com/webhook',
                always_send_webhook: true,
                secret_key: 'secret'
            } as Environment);
        });
        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
            1
        );
        expect(axios.post).toHaveBeenCalled();
    });
});
