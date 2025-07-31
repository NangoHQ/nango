import formData from 'form-data';
import Mailgun from 'mailgun.js';

import { envs } from '../env.js';

import type { EmailProvider } from '../provider.js';
import type { Interfaces, MessagesSendResult } from 'mailgun.js/definitions';

export class MailgunEmailProvider implements EmailProvider<MessagesSendResult> {
    private client: Interfaces.IMailgunClient;

    constructor() {
        const mailgun = new Mailgun(formData);
        this.client = mailgun.client({
            username: 'api',
            key: process.env['MAILGUN_API_KEY'] || '',
            url: process.env['MAILGUN_URL'] || ''
        });
    }

    async send(email: string, subject: string, html: string): Promise<MessagesSendResult> {
        return this.client.messages.create('nango.dev', {
            from: envs.SMTP_FROM,
            to: [email],
            subject,
            html
        });
    }
}
