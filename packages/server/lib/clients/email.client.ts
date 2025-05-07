import formData from 'form-data';
import Mailgun from 'mailgun.js';

import { getLogger } from '@nangohq/utils';

import type { Interfaces, MessagesSendResult } from 'mailgun.js/definitions';

interface EmailProvider<T> {
    send(email: string, subject: string, html: string): Promise<T>;
}

const logger = getLogger('Server.EmailClient');

export class EmailClient {
    private static instance: EmailClient | undefined;
    private provider: MailgunEmailProvider | NoEmailProvider;

    private constructor() {
        if (process.env['MAILGUN_API_KEY']) {
            this.provider = new MailgunEmailProvider();
        } else {
            this.provider = new NoEmailProvider();
        }
    }

    static getInstance() {
        if (!EmailClient.instance) {
            EmailClient.instance = new EmailClient();
        }
        return EmailClient.instance;
    }

    send(email: string, subject: string, html: string) {
        return this.provider.send(email, subject, html);
    }
}

class NoEmailProvider implements EmailProvider<void> {
    // eslint-disable-next-line @typescript-eslint/require-await
    async send(email: string, subject: string, html: string): Promise<void> {
        logger.info('Email client not configured');
        logger.info('The following email would have been sent:');
        logger.info(email, subject);
        logger.info(html);
    }
}

class MailgunEmailProvider implements EmailProvider<MessagesSendResult> {
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
        return this.client.messages.create('email.nango.dev', {
            from: 'Nango <support@nango.dev>',
            to: [email],
            subject,
            html
        });
    }
}
