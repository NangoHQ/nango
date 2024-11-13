import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { getLogger } from '@nangohq/utils';
import type Client from 'mailgun.js/client';

const logger = getLogger('Server.EmailClient');

export class EmailClient {
    private static instance: EmailClient | undefined;
    private client: Client;

    private constructor(config: { username: string; key: string; url?: string }) {
        const mailgun = new Mailgun(formData);
        this.client = mailgun.client(config);
    }

    static getInstance() {
        if (!EmailClient.instance) {
            EmailClient.instance = new EmailClient({
                username: 'api',
                key: process.env['MAILGUN_API_KEY'] || 'EMPTY',
                url: process.env['MAILGUN_URL'] || ''
            });
        }
        return EmailClient.instance;
    }

    send(email: string, subject: string, html: string) {
        if (process.env['MAILGUN_API_KEY'] === undefined || process.env['MAILGUN_API_KEY'] === 'EMPTY' || !this.client) {
            logger.info('Email client not configured');
            logger.info('The following email would have been sent:');
            logger.info(email, subject);
            logger.info(html);
            return;
        }

        return this.client.messages.create('email.nango.dev', {
            from: 'Nango <support@nango.dev>',
            to: [email],
            subject,
            html
        });
    }
}
