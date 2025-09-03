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
            key: envs.MAILGUN_API_KEY || '',
            url: envs.MAILGUN_URL || ''
        });
    }

    async send(email: string, subject: string, html: string): Promise<MessagesSendResult> {
        return this.client.messages.create(envs.SMTP_DOMAIN, {
            from: envs.SMTP_FROM,
            to: [email],
            subject,
            html
        });
    }
}
