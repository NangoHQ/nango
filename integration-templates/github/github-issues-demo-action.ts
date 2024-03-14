import type { NangoSync, GithubWriteIssueInput, GithubWriteIssueResult } from './models';

export default async function runAction(nango: NangoSync, input: GithubWriteIssueInput): Promise<GithubWriteIssueResult> {
    // Fetch issues from GitHub
    const res = await nango.post({
        endpoint: '/repos/NangoHQ/interactive-demo/issues',
        data: {
            title: `[demo] ${input.title}`,
            body: `This Issue was created automatically using Nango's Action system.

Action can be triggered with an HTTP call.
Take a look at our [Documentation](https://docs.nango.dev/integrate/guides/perform-workflows-with-an-api)`,
            labels: ['automatic']
        }
    });

    return {
        url: res.data.html_url,
        status: res.status
    };
}
