import type { GithubIssueDemo, NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync) {
    // Fetch issues from GitHub
    const res = await nango.get({
        endpoint: '/repos/NangoHQ/interactive-demo/issues?labels=demo&sort=created&direction=asc'
    });

    // Map issues to your preferred schema
    const issues: GithubIssueDemo[] = res.data.map(({ id, title, html_url }: any) => {
        return { id, title, url: html_url };
    });

    // Persist issues to the Nango cache
    await nango.batchSave(issues, 'GithubIssueDemo');
}
