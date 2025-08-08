import he from 'he';

import { EmailClient } from '@nangohq/email';

import { logger } from './logger.js';

import type { AccountMetricsUsageSummary, AccountUsageMetric, DBTeam, DBUser } from '@nangohq/types';

export async function sendUsageNearLimitEmail({
    user,
    account,
    usageSummary,
    triggeringMetric
}: {
    user: Pick<DBUser, 'name' | 'email'>;
    account: DBTeam;
    usageSummary: AccountMetricsUsageSummary;
    triggeringMetric: AccountUsageMetric;
}) {
    const metricName = usageSummary[triggeringMetric].label;

    logger.info(`Sending usage near limit email for ${metricName} to ${user.email}`);

    const formattedUsageSummary = formatUsageSummary(usageSummary, triggeringMetric);

    const emailClient = EmailClient.getInstance();
    await emailClient.send(
        user.email,
        `Your Nango account has reached 80% of its free tier limits for ${metricName}`,
        `<p>Hi ${he.encode(user.name)},</p>

    <p>Your Nango account "${he.encode(account.name)}" has reached 80% of its free tier limits for ${metricName}:</p>

    ${formattedUsageSummary}

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

export async function sendUsageLimitReachedEmail({
    user,
    account,
    usageSummary,
    triggeringMetric
}: {
    user: Pick<DBUser, 'name' | 'email'>;
    account: DBTeam;
    usageSummary: AccountMetricsUsageSummary;
    triggeringMetric: AccountUsageMetric;
}) {
    const metricName = usageSummary[triggeringMetric].label;

    logger.info(`Sending usage limit reached email for ${metricName} to ${user.email}`);

    const formattedUsageSummary = formatUsageSummary(usageSummary, triggeringMetric);

    const emailClient = EmailClient.getInstance();
    await emailClient.send(
        user.email,
        `[ACTION REQUIRED] Your Nango account exceeds its free tier limits for ${metricName}`,
        `<p>Hi ${he.encode(user.name)},</p>

<p>Your Nango account "${he.encode(account.name)}" exceeds its free tier limits for ${metricName}:</p>

${formattedUsageSummary}

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

function formatUsageSummary(usageSummary: AccountMetricsUsageSummary, triggeringMetric: AccountUsageMetric) {
    const usageLines = Object.entries(usageSummary).map(([metric, u]) => {
        const isPerMonth = metric !== 'connections';
        const postfix = isPerMonth && u.limit ? 'per month' : '';

        const overLimit = u.limit && u.usage >= u.limit;
        const over80Percent = u.limit && u.usage >= u.limit * 0.8;

        const usageNumber = overLimit
            ? `<span style="color: #ef665b; font-weight: bold;">${u.usage}</span>`
            : over80Percent
              ? `<span style="color: #e6a70d; font-weight: bold;">${u.usage}</span>`
              : u.usage.toString();

        const line = `${u.label}: ${usageNumber}${u.limit ? `/${u.limit}` : ''} ${postfix}`;

        const isTriggeringMetric = metric === triggeringMetric;
        return isTriggeringMetric ? `<b>${line}</b>` : line;
    });

    return ['<p>', usageLines.join('<br>'), '</p>'].join('\n');
}
