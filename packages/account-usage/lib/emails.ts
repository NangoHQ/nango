import he from 'he';

import { EmailClient } from '@nangohq/email';

import type { DBTeam, DBUser, MetricUsage } from '@nangohq/types';

export async function sendUsageNearLimitEmail({ user, account, usage }: { user: Pick<DBUser, 'name' | 'email'>; account: DBTeam; usage: MetricUsage[] }) {
    const formattedUsage = formatUsage(usage);

    const emailClient = EmailClient.getInstance();
    await emailClient.send(
        user.email,
        `Your Nango account has reached 80% of its free tier limits`,
        `<p>Hi ${he.encode(user.name)},</p>

<p>Your Nango account "${he.encode(account.name)}" has reached 80% of its free tier limits:</p>

${formattedUsage}

<p>
Features that exceed their limits will be blocked.<br>
To avoid disruptions, either reduce your usage or <a href="https://app.nango.dev/prod/team/billing">upgrade your account</a>.
</p>

<p>If you have questions, reply to this email or <a href="https://nango.dev/demo">book a call</a> with us.</p>

<p>
Thanks & best,<br>
Team Nango
</p>
            `
    );
}

export async function sendUsageLimitReachedEmail({ user, account, usage }: { user: Pick<DBUser, 'name' | 'email'>; account: DBTeam; usage: MetricUsage[] }) {
    const formattedUsage = formatUsage(usage);

    const emailClient = EmailClient.getInstance();
    await emailClient.send(
        user.email,
        `[ACTION REQUIRED] Your Nango account exceeds its free tier limits`,
        `<p>Hi ${he.encode(user.name)},</p>

<p>Your Nango account "${he.encode(account.name)}" exceeds its free tier limits:</p>

${formattedUsage}

<p>
Features that exceed their limit are blocked until you <a href="https://app.nango.dev/prod/team/billing">upgrade your account</a> or the limit resets.<br>
This may impact your customers if you are running integrations in production.
</p>

<p>If you have questions, reply to this email or <a href="https://nango.dev/demo">book a call</a> with us.</p>

<p>
Thanks & best,<br>
Team Nango
</p>
            `
    );
}

function formatUsage(usage: MetricUsage[]) {
    const usageLines = usage.map((u) => {
        const postFix = u.limit && u.usage >= u.limit ? '🚨' : u.limit && u.usage >= u.limit * 0.8 ? '⚠️' : '';
        return `${u.label}: ${u.usage} / ${u.limit} ${postFix}`;
    });

    return ['<p>', usageLines.join('<br>'), '</p>'].join('\n');
}
