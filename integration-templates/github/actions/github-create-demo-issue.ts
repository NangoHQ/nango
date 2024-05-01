import type { NangoSync, GithubCreateIssueInput, GithubCreateIssueResult } from '../../models';

export default async function runAction(nango: NangoSync, input: GithubCreateIssueInput): Promise<GithubCreateIssueResult> {
    // Create one issue in GitHub
    const res = await nango.post({
        endpoint: '/repos/NangoHQ/interactive-demo/issues',
        data: {
            title: `[demo] ${input.title}`,
            body: `This issue was created automatically using Nango Action.

Nango uses actions to perform workflows involving external APIs. Workflows can involve arbitrary series of API requests & data transformations.
Take a look at our [Documentation](https://docs.nango.dev/integrate/guides/perform-workflows-with-an-api)`,
            labels: ['automatic']
        }
    });

    return {
        url: res.data.html_url,
        status: res.status
    };
}
