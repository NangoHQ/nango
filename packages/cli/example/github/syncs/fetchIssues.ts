import { createSync } from 'nango';
import { z } from 'zod';

import type { GithubIssue, NangoSync } from 'nango';

const LIMIT = 100;

export default createSync({
    description: `Fetches the Github issues from all a user's repositories.
          Details: full sync, doesn't track deletes, metadata is not required.`,
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/example/github/issues', group: 'Issues' }],
    integrationId: 'github',
    runs: 'every hour',
    autoStart: true,
    syncType: 'full',

    trackDeletes: true,
    models: {
        GithubIssue: issueSchema
    },
    metadata: z.never(),

    // Sync execution
    exec: async (nango) => {
        const repos: any[] = await getAllRepositories(nango);

        for (const repo of repos) {
            const proxyConfig = {
                endpoint: `/repos/${repo.owner.login}/${repo.name}/issues`,
                paginate: {
                    limit: LIMIT
                }
            };
            for await (const issueBatch of nango.paginate(proxyConfig)) {
                const issues: any[] = issueBatch.filter((issue: any) => !('pull_request' in issue));

                const mappedIssues: GithubIssue[] = issues.map((issue: any) => ({
                    id: issue.id,
                    owner: repo.owner.login,
                    repo: repo.name,
                    issue_number: issue.number,
                    title: issue.title,
                    state: issue.state,
                    author: issue.user.login,
                    author_id: issue.user.id,
                    body: issue.body,
                    date_created: issue.created_at,
                    date_last_modified: issue.updated_at
                }));

                if (mappedIssues.length > 0) {
                    await nango.batchSave(mappedIssues, 'GithubIssue');
                    await nango.log(`Sent ${mappedIssues.length} issues from ${repo.owner.login}/${repo.name}`);
                }
            }
        }
    },

    // Webhook handler
    onWebhook: async (nango, payload) => {
        await nango.log('hello', payload);
    }
});

async function getAllRepositories(nango: NangoSync) {
    const records: any[] = [];
    const proxyConfig = {
        endpoint: '/user/repos',
        paginate: {
            limit: LIMIT
        }
    };

    for await (const recordBatch of nango.paginate(proxyConfig)) {
        records.push(...recordBatch);
    }

    return records;
}
