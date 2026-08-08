import { envs } from '../env.js';

import type { EmailProvider } from '../provider.js';

type Placeholder = 'to' | 'from' | 'subject' | 'html';

const PLACEHOLDER = /\{\{(to|from|subject|html)\}\}/g;

/**
 * Fills {{to}}, {{from}}, {{subject}} and {{html}} into every string of an already parsed
 * JSON template. Substituting into the parsed structure rather than into the raw text keeps
 * values escaped correctly whatever the HTML body contains.
 */
export function renderBody(template: unknown, values: Record<Placeholder, string>): unknown {
    if (typeof template === 'string') {
        return template.replace(PLACEHOLDER, (_match, key: Placeholder) => values[key]);
    }
    if (Array.isArray(template)) {
        return template.map((entry) => renderBody(entry, values));
    }
    if (template !== null && typeof template === 'object') {
        return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, renderBody(value, values)]));
    }
    return template;
}

/**
 * Sends through any mail API that accepts a JSON payload over HTTP (SendGrid, Resend,
 * Postmark, ...), the shape of the payload being described by EMAIL_HTTP_BODY.
 */
export class HttpEmailProvider implements EmailProvider<void> {
    private url: string;
    private headers: Record<string, string>;
    private bodyTemplate: unknown;

    constructor() {
        if (!envs.EMAIL_HTTP_URL || envs.EMAIL_HTTP_BODY === undefined) {
            throw new Error('EMAIL_HTTP_URL and EMAIL_HTTP_BODY are both required to send emails over HTTP');
        }
        this.url = envs.EMAIL_HTTP_URL;
        this.headers = envs.EMAIL_HTTP_HEADERS;
        this.bodyTemplate = envs.EMAIL_HTTP_BODY;
    }

    async send(email: string, subject: string, html: string): Promise<void> {
        const body = renderBody(this.bodyTemplate, { to: email, from: envs.SMTP_FROM, subject, html });

        const res = await fetch(this.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...this.headers },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            throw new Error(`Email API responded with ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }
    }
}
