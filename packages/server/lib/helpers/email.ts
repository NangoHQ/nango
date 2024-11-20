import { basePublicUrl } from '@nangohq/utils';
import { EmailClient } from '../clients/email.client.js';
import type { DBInvitation, DBTeam, DBUser } from '@nangohq/types';

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

export async function sendResetPasswordEmail({ user, token }: { user: DBUser; token: string }) {
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
    user: Pick<DBUser, 'name'>;
    invitation: DBInvitation;
}) {
    const emailClient = EmailClient.getInstance();
    await emailClient.send(
        email,
        `You're Invited! Join "${account.name}" on Nango`,
        `<p>Hi,</p>

<p>${user.name} invites you to join "${account.name}" on Nango.</p>

<p>Join this team by clicking <a href="${basePublicUrl}/signup/${invitation.token}">here</a> and completing your signup.</p>

<p>Questions or issues? We are happy to help on the <a href="https://nango.dev/slack">Slack community</a>!</p>

<p>Best,<br>
Team Nango</p>
            `
    );
}
