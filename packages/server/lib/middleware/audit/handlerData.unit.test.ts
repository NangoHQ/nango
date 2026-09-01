import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { reportMissingHandlerData } from './handlerData.js';

describe('audit handler data (unit)', () => {
    let increment: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        increment = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('counts data the handler never returned, on success', () => {
        reportMissingHandlerData(undefined, ['connectionUpsert'], { resource: 'connection', action: 'created', succeeded: true });
        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_HANDLER_DATA_MISSING, 1, {
            resource: 'connection',
            action: 'created'
        });
    });

    it('reports nothing when the spec expects nothing back, so an unannotated spec is silent', () => {
        reportMissingHandlerData(undefined, [], { resource: 'connection', action: 'created', succeeded: true });
        expect(increment).not.toHaveBeenCalled();
    });

    it('stays silent when the request was refused', () => {
        reportMissingHandlerData(undefined, ['connectionUpsert'], { resource: 'connection', action: 'created', succeeded: false });
        expect(increment).not.toHaveBeenCalled();
    });

    it('accepts one of several alternatives, as the auth path needs', () => {
        reportMissingHandlerData({ authSucceeded: true }, ['authSucceeded', 'authPendingMfa'], { resource: 'app_auth', action: 'login', succeeded: true });
        expect(increment).not.toHaveBeenCalled();
    });
});
