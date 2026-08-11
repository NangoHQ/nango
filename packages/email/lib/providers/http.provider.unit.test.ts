import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpEmailProvider, renderBody } from './http.provider.js';

vi.mock('../env.js', () => ({
    envs: {
        EMAIL_HTTP_URL: 'https://api.example.com/v3/mail/send',
        EMAIL_HTTP_HEADERS: { authorization: 'Bearer test-key' },
        EMAIL_HTTP_BODY: {
            personalizations: [{ to: [{ email: '{{to}}' }] }],
            from: { email: '{{from}}' },
            subject: '{{subject}}',
            content: [{ type: 'text/html', value: '{{html}}' }],
            tracking: { enabled: true }
        },
        SMTP_FROM: 'Nango <noreply@example.com>',
        EMAIL_HTTP_TIMEOUT_MS: 10_000
    }
}));

const values = { to: 'user@example.com', from: 'Nango <noreply@example.com>', subject: 'Verify your email', html: '<p>Hi</p>' };

describe('renderBody', () => {
    const testCases = [
        {
            name: 'replaces a string that is only a placeholder with the value',
            template: '{{subject}}',
            expected: 'Verify your email'
        },
        {
            name: 'replaces placeholders embedded in a longer string',
            template: 'Subject: {{subject}}',
            expected: 'Subject: Verify your email'
        },
        {
            name: 'replaces placeholders nested in objects and arrays',
            template: { personalizations: [{ to: [{ email: '{{to}}' }] }] },
            expected: { personalizations: [{ to: [{ email: 'user@example.com' }] }] }
        },
        {
            name: 'leaves non-string values untouched',
            template: { enabled: true, retries: 3, tags: null },
            expected: { enabled: true, retries: 3, tags: null }
        },
        {
            name: 'leaves unknown placeholders in place',
            template: '{{unknown}}',
            expected: '{{unknown}}'
        }
    ];

    for (const testCase of testCases) {
        it(testCase.name, () => {
            expect(renderBody(testCase.template, values)).toStrictEqual(testCase.expected);
        });
    }

    it('substitutes HTML containing quotes, ampersands and newlines verbatim', () => {
        const html = '<a href="https://example.com/a?b=1&c=2">link</a>\n<p>"quoted"</p>';
        const rendered = renderBody({ content: '{{html}}' }, { ...values, html });

        expect(rendered).toStrictEqual({ content: html });
    });
});

describe('HttpEmailProvider.send', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('posts the filled-in template to the configured URL and headers', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));

        await new HttpEmailProvider().send('user@example.com', 'Verify your email', '<p>Hi</p>');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] ?? [];
        expect(url).toBe('https://api.example.com/v3/mail/send');
        expect(init?.method).toBe('POST');
        expect(init?.headers).toStrictEqual({ 'content-type': 'application/json', authorization: 'Bearer test-key' });
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(JSON.parse(init?.body as string)).toStrictEqual({
            personalizations: [{ to: [{ email: 'user@example.com' }] }],
            from: { email: 'Nango <noreply@example.com>' },
            subject: 'Verify your email',
            content: [{ type: 'text/html', value: '<p>Hi</p>' }],
            tracking: { enabled: true }
        });
    });

    it('throws with the status and response body when the API rejects the request', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"errors":["unauthorized"]}', { status: 401 }));

        await expect(new HttpEmailProvider().send('user@example.com', 'Verify your email', '<p>Hi</p>')).rejects.toThrow(
            'Email API responded with 401: {"errors":["unauthorized"]}'
        );
    });

    it('propagates abort errors when the request times out', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError'));

        await expect(new HttpEmailProvider().send('user@example.com', 'Verify your email', '<p>Hi</p>')).rejects.toMatchObject({
            name: 'TimeoutError'
        });
    });
});
