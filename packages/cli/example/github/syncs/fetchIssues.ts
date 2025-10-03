import { createSync } from 'nango';
import * as z from 'zod';

const LIMIT = 100;
const issueSchema = z.object({
    id: z.string(),
    owner: z.string(),
    repo: z.string(),
    issue_number: z.number(),
    title: z.string(),
    state: z.string(),
    author: z.string(),
    author_id: z.number(),
    body: z.string(),
    date_created: z.string(),
    date_last_modified: z.string()
});
type GithubIssue = z.infer<typeof issueSchema>;

const sync = createSync({
    description: `Fetches the Github issues from all a user's repositories.`,
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/example/github/issues', group: 'Issues' }],
    frequency: 'every hour',
    autoStart: true,
    syncType: 'full',

    metadata: z.void(),
    models: {
        GithubIssue: issueSchema
    },

    // Sync execution
    exec: async (nango) => {
        const repos = await getAllRepositories(nango);

        for (const repo of repos) {
            const proxyConfig = {
                endpoint: `/repos/${repo.owner.login}/${repo.name}/issues`,
                paginate: {
                    limit: LIMIT
                }
            };
            for await (const issueBatch of nango.paginate(proxyConfig)) {
                const issues = issueBatch.filter((issue) => !('pull_request' in issue));

                const mappedIssues: GithubIssue[] = issues.map((issue) => ({
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

        await nango.deleteRecordsFromPreviousExecutions('GithubIssue');
    },

    // Webhook handler
    onWebhook: async (nango, payload) => {
        await nango.log('This is a webhook script', payload);
    }
});

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;

async function getAllRepositories(nango: NangoSyncLocal): Promise<any[]> {
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
