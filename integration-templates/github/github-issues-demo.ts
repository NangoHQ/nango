import type { GithubIssueDemo, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    // Fetch issues from GitHub
    const res = await nango.get({
        endpoint: '/repos/NangoHQ/interactive-demo/issues'
    });

    // Map issues to your preferred schema.
    const issues: GithubIssueDemo[] = res.data.map(({ id, title, url }: any) => {
        return { id, title, url };
    });

    // Persist issues to the Nango cache.
    await nango.batchSave(issues, 'GithubIssueDemo');
}
