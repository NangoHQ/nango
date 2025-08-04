import { envs } from './env.js';
import { MailgunEmailProvider } from './providers/mailgun.provider.js';
import { NoEmailProvider } from './providers/no-email.provider.js';
import { SmtpEmailProvider } from './providers/smtp.provider.js';

export class EmailClient {
    private static instance: EmailClient | undefined;
    private provider: MailgunEmailProvider | SmtpEmailProvider | NoEmailProvider; // Mailgun specific provider is here for legacy reason

    private constructor() {
        if (envs.MAILGUN_API_KEY) {
            this.provider = new MailgunEmailProvider();
        } else if (envs.SMTP_URL) {
            this.provider = new SmtpEmailProvider();
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
