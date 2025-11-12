import { vi } from 'vitest';

import { NangoActionMockBase, NangoSyncMockBase } from './utils.js';

/**
 * Vitest-enabled version of NangoActionMock.
 * Wraps all methods with vi.fn() for test spying.
 * Use NangoActionMockBase if you don't need vitest functionality.
 */
class NangoActionMock extends NangoActionMockBase {
    // Override method signatures to indicate they are vi.fn() mocks
    declare setLogger: ReturnType<typeof vi.fn>;
    declare log: ReturnType<typeof vi.fn>;
    declare getConnection: ReturnType<typeof vi.fn>;
    declare getMetadata: ReturnType<typeof vi.fn>;
    declare paginate: ReturnType<typeof vi.fn>;
    declare get: ReturnType<typeof vi.fn>;
    declare post: ReturnType<typeof vi.fn>;
    declare patch: ReturnType<typeof vi.fn>;
    declare put: ReturnType<typeof vi.fn>;
    declare delete: ReturnType<typeof vi.fn>;
    declare proxy: ReturnType<typeof vi.fn>;
    declare getWebhookURL: ReturnType<typeof vi.fn>;
    declare zodValidateInput: ReturnType<typeof vi.fn>;

    constructor(args: { dirname: string; name: string; Model: string }) {
        super(args);
        // Wrap all methods with vi.fn() for testing
        this.setLogger = vi.fn();
        this.log = vi.fn();
        this.getConnection = vi.fn(this._getConnectionData);
        this.getMetadata = vi.fn(this._getMetadataData);
        this.paginate = vi.fn(this._getProxyPaginateData);
        this.get = vi.fn(this._proxyGetData);
        this.post = vi.fn(this._proxyPostData);
        this.patch = vi.fn(this._proxyPatchData);
        this.put = vi.fn(this._proxyPutData);
        this.delete = vi.fn(this._proxyDeleteData);
        this.proxy = vi.fn(this._proxyData);
        this.getWebhookURL = vi.fn(() => 'https://example.com/webhook');
        this.updateMetadata = vi.fn();
        this.getToken = vi.fn();
        this.getIntegration = vi.fn();
        this.setMetadata = vi.fn();
        this.setFieldMapping = vi.fn();
        this.getFieldMapping = vi.fn();
        this.getEnvironmentVariables = vi.fn(() => Promise.resolve({}));
        this.getFlowAttributes = vi.fn(() => Promise.resolve({}));
        this.triggerAction = vi.fn();
        this.triggerSync = vi.fn();
        this.zodValidateInput = vi.fn(({ input }) => Promise.resolve({ success: true as const, data: input }));
        this.startSync = vi.fn();
        this.uncontrolledFetch = vi.fn();
        this.tryAcquireLock = vi.fn(() => Promise.resolve(true));
        this.releaseLock = vi.fn();
        this.releaseAllLocks = vi.fn();
    }
}

/**
 * Vitest-enabled version of NangoSyncMock.
 * Wraps all methods with vi.fn() for test spying.
 * Use NangoSyncMockBase if you don't need vitest functionality.
 */
class NangoSyncMock extends NangoSyncMockBase {
    declare batchSave: ReturnType<typeof vi.fn>;
    declare batchDelete: ReturnType<typeof vi.fn>;
    declare batchUpdate: ReturnType<typeof vi.fn>;
    declare getRecordsByIds: ReturnType<typeof vi.fn>;
    declare deleteRecordsFromPreviousExecutions: ReturnType<typeof vi.fn>;
    declare setMergingStrategy: ReturnType<typeof vi.fn>;
    declare batchSend: ReturnType<typeof vi.fn>;

    constructor(args: { dirname: string; name: string; Model: string }) {
        super(args);
        // Wrap sync-specific methods with vi.fn()
        this.batchSave = vi.fn();
        this.batchDelete = vi.fn();
        this.batchUpdate = vi.fn();
        this.getRecordsByIds = vi.fn();
        this.deleteRecordsFromPreviousExecutions = vi.fn();
        this.setMergingStrategy = vi.fn();
        this.batchSend = vi.fn();
    }
}

export { NangoActionMock, NangoSyncMock };
