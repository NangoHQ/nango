import nodemailer from 'nodemailer';

import { envs } from '../env.js';

import type { EmailProvider } from '../provider.js';
import type { Transporter } from 'nodemailer';

export class SmtpEmailProvider implements EmailProvider<void> {
    private transporter: Transporter;

    constructor() {
        this.transporter = nodemailer.createTransport(envs.SMTP_URL, {
            tls: {
                rejectUnauthorized: envs.SMTP_TLS_REJECT_UNAUTHORIZED
            }
        });
    }

    async send(email: string, subject: string, html: string): Promise<void> {
        await this.transporter.sendMail({
            from: envs.SMTP_FROM,
            to: email,
            subject,
            html
        });
    }
}
