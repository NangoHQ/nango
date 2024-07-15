import { basePublicUrl } from '@nangohq/utils';
import { EmailClient } from '../clients/email.client.js';
import type { User } from '@nangohq/shared';
import type { DBInvitation, DBTeam } from '@nangohq/types';

export function sendVerificationEmail(email: string, name: string, token: string) {
    const emailClient = EmailClient.getInstance();
    emailClient.send(
        email,
        `Verify your email address`,
        `
<p>Hi ${name},</p>

<p>Please verify your account on Nango by clicking <a href="${basePublicUrl}/signup/verification/${token}">${basePublicUrl}/signup/verification/${token}</a></p>

<p>Questions or issues? We are happy to help on the <a href="https://nango.dev/slack">Slack community</a>!</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}

export async function sendResetPasswordEmail({ user, token }: { user: User; token: string }) {
    const emailClient = EmailClient.getInstance();
    await emailClient.send(
        user.email,
        'Nango password reset',
        `<p>Hi ${user.name},</p>

        <p>Someone requested a password reset.</p>
        <p><a href="${basePublicUrl}/reset-password/${token}">Reset password</a></p>
        <p>If you didn't initiate this request, please contact us immediately at support@nango.dev</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}

export async function sendInviteEmail({
    email,
    account,
    user,
    invitation
}: {
    email: string;
    account: DBTeam;
    user: Pick<User, 'name'>;
    invitation: DBInvitation;
}) {
    const emailClient = EmailClient.getInstance();
    await emailClient.send(
        email,
        `Join the "${account.name}" account on Nango`,
        `<p>Hi,</p>

<p>${user.name} is inviting you to join the "${account.name}" account on Nango.</p>

<p>Join this account by clicking <a href="${basePublicUrl}/signup/${invitation.token}">here</a> and completing your signup.</p>

<p>Questions or issues? We are happy to help on the <a href="https://nango.dev/slack">Slack community</a>!</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}
