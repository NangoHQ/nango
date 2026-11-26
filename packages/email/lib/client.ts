import { envs } from './env.js';
import { logger } from './logger.js';
import { HttpEmailProvider } from './providers/http.provider.js';
import { MailgunEmailProvider } from './providers/mailgun.provider.js';
import { NoEmailProvider } from './providers/no-email.provider.js';
import { SesEmailProvider } from './providers/ses.provider.js';
import { SmtpEmailProvider } from './providers/smtp.provider.js';

import type { EmailProvider } from './provider.js';

export type EmailProviderName = NonNullable<typeof envs.EMAIL_PROVIDER>;

type ProviderEnvs = Pick<typeof envs, 'EMAIL_PROVIDER' | 'MAILGUN_API_KEY' | 'SMTP_URL' | 'EMAIL_HTTP_URL'>;

/**
 * EMAIL_PROVIDER wins when set. Otherwise the provider is inferred the way it always was, so
 * self-hosted deployments upgrade without config changes. SES is never inferred: AWS_REGION is
 * set on most AWS deployments and must not silently switch them away from their current provider.
 */
export function resolveEmailProvider(providerEnvs: ProviderEnvs): { provider: EmailProviderName; ignored: EmailProviderName[] } {
    if (providerEnvs.EMAIL_PROVIDER) {
        return { provider: providerEnvs.EMAIL_PROVIDER, ignored: [] };
    }

    // Mailgun first for legacy reasons
    const configured: EmailProviderName[] = [];
    if (providerEnvs.MAILGUN_API_KEY) {
        configured.push('mailgun');
    }
    if (providerEnvs.SMTP_URL) {
        configured.push('smtp');
    }
    if (providerEnvs.EMAIL_HTTP_URL) {
        configured.push('http');
    }

    const [provider = 'none', ...ignored] = configured;
    return { provider, ignored };
}

function createProvider(name: EmailProviderName): EmailProvider<unknown> {
    switch (name) {
        case 'mailgun':
            return new MailgunEmailProvider();
        case 'smtp':
            return new SmtpEmailProvider();
        case 'ses':
            return new SesEmailProvider();
        case 'http':
            // EMAIL_HTTP_BODY is guaranteed alongside the URL: ENVS rejects one without the other,
            // so a half-configured HTTP provider fails at startup rather than on the first email.
            return new HttpEmailProvider();
        case 'none':
            return new NoEmailProvider();
    }
}

export class EmailClient {
    private static instance: EmailClient | undefined;
    private provider: EmailProvider<unknown>;

    private constructor() {
        const { provider, ignored } = resolveEmailProvider(envs);
        if (ignored.length > 0) {
            logger.warning(
                `Several email providers are configured; sending with "${provider}" and ignoring ${ignored.map((name) => `"${name}"`).join(', ')}. Set EMAIL_PROVIDER to choose explicitly.`
            );
        }
        this.provider = createProvider(provider);
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
