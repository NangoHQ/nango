import { vi } from 'vitest';

import * as utils from '@nangohq/utils';

export function mockWebhookDenylistAllowAll(): void {
    vi.spyOn(utils, 'isBaseUrlOverrideDenied').mockReturnValue(false);
}

export function restoreWebhookDenylistMock(): void {
    vi.mocked(utils.isBaseUrlOverrideDenied).mockRestore();
}
