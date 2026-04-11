import { describe, expect, it } from 'vitest';

import { shouldRefreshAgentSandboxTimeout } from './agent-sandbox.service.js';

describe('agent sandbox timeout refresh throttle', () => {
    it('does not refresh before the throttle window elapses', () => {
        expect(shouldRefreshAgentSandboxTimeout(1_000, 60_999)).toBe(false);
    });

    it('refreshes once the throttle window elapses', () => {
        expect(shouldRefreshAgentSandboxTimeout(1_000, 61_000)).toBe(true);
    });
});
