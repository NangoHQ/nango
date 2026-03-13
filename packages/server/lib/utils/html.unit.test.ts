import { describe, expect, it, vi } from 'vitest';

import { authHtml } from './html.js';

/**
 * Create a minimal mock of Express Response (and attached Request)
 * that captures the HTML sent via res.send().
 */
function createMockRes(query: Record<string, string> = {}): { res: any; getSentHtml: () => string } {
    let sentBuffer: Buffer | null = null;
    const res = {
        req: { query },
        status: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        send: vi.fn((buf: Buffer) => {
            sentBuffer = buf;
        })
    };
    return {
        res,
        getSentHtml: () => {
            if (!sentBuffer) throw new Error('res.send() was not called');
            return sentBuffer.toString('utf-8');
        }
    };
}

describe('authHtml', () => {
    describe('success (no error)', () => {
        it('should return 200 with success content', () => {
            const { res, getSentHtml } = createMockRes();
            authHtml({ res });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/html');
            const html = getSentHtml();
            expect(html).toContain('Successful connection');
            expect(html).not.toContain('Connection failed');
        });

        it('should include setTimeout self-close fallback on success', () => {
            const { res, getSentHtml } = createMockRes();
            authHtml({ res });
            const html = getSentHtml();
            // The fallback setTimeout should be present
            expect(html).toContain('window.setTimeout');
            expect(html).toContain('closeWindow()');
        });

        it('should include postMessage notification for opener', () => {
            const { res, getSentHtml } = createMockRes();
            authHtml({ res });
            const html = getSentHtml();
            expect(html).toContain('notifyOpener');
            expect(html).toContain('nango_oauth_callback_success');
        });

        it('should include ACK listener for Connect UI', () => {
            const { res, getSentHtml } = createMockRes();
            authHtml({ res });
            const html = getSentHtml();
            expect(html).toContain('nango_oauth_callback_ack');
        });
    });

    describe('error (server error)', () => {
        it('should return 400 with error content', () => {
            const { res, getSentHtml } = createMockRes();
            authHtml({ res, error: 'token_exchange_failed' });
            expect(res.status).toHaveBeenCalledWith(400);
            const html = getSentHtml();
            expect(html).toContain('Connection failed');
            expect(html).not.toContain('Successful connection');
        });

        it('should NOT include setTimeout self-close on error', () => {
            const { res, getSentHtml } = createMockRes();
            authHtml({ res, error: 'something went wrong' });
            const html = getSentHtml();
            // The error condition should prevent the setTimeout auto-close
            // __nangoOAuthError is truthy → the if (!window.__nangoOAuthError) block is skipped
            expect(html).toContain('window.__nangoOAuthError');
            expect(html).toContain('if (!window.__nangoOAuthError)');
        });

        it('should include error details in expandable section', () => {
            const { res, getSentHtml } = createMockRes();
            authHtml({ res, error: 'token_exchange_failed' });
            const html = getSentHtml();
            expect(html).toContain('Show error details');
            expect(html).toContain('token_exchange_failed');
        });

        it('should send error via postMessage', () => {
            const { res, getSentHtml } = createMockRes();
            authHtml({ res, error: 'some error' });
            const html = getSentHtml();
            expect(html).toContain('nango_oauth_callback_error');
        });
    });

    describe('error (provider error from query params)', () => {
        it('should detect provider errors in query string', () => {
            const { res, getSentHtml } = createMockRes({ error: 'access_denied', error_description: 'User denied access' });
            authHtml({ res });
            // Provider error in query → treated as error even without server error param
            expect(res.status).toHaveBeenCalledWith(200); // no server error → 200, but content shows error
            const html = getSentHtml();
            expect(html).toContain('Connection failed');
            expect(html).toContain('access_denied');
            expect(html).toContain('User denied access');
        });
    });

    describe('self-close behavior', () => {
        it('success page should self-close via setTimeout as fallback', () => {
            const { res, getSentHtml } = createMockRes();
            authHtml({ res });
            const html = getSentHtml();
            // On success: __nangoOAuthError is null → setTimeout runs
            expect(html).toContain('window.__nangoOAuthError = null');
            expect(html).toContain('if (!window.__nangoOAuthError)');
            expect(html).toContain('window.setTimeout');
        });

        it('error page should NOT self-close', () => {
            const { res, getSentHtml } = createMockRes();
            authHtml({ res, error: 'failed' });
            const html = getSentHtml();
            // On error: __nangoOAuthError is truthy → setTimeout is skipped
            expect(html).not.toContain('window.__nangoOAuthError = null');
            // The if guard ensures setTimeout only runs when no error
            expect(html).toContain('if (!window.__nangoOAuthError)');
        });

        it('should still listen for ACK to close on both success and error', () => {
            // Success
            const success = createMockRes();
            authHtml({ res: success.res });
            expect(success.getSentHtml()).toContain('nango_oauth_callback_ack');

            // Error
            const error = createMockRes();
            authHtml({ res: error.res, error: 'failed' });
            expect(error.getSentHtml()).toContain('nango_oauth_callback_ack');
        });
    });
});
