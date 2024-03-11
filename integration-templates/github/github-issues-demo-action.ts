import type { NangoSync } from './models';

interface GithubIssueInput {
    title: string;
}

export default async function runAction(nango: NangoSync, input: GithubIssueInput): Promise<{ status: boolean }> {
    // Fetch issues from GitHub
    const res = await nango.post({
        endpoint: '/repos/NangoHQ/interactive-demo/issues',
        data: {
            title: input.title,
            body: `This Issue was created automatically using Nango's Action system.

Action can be triggered with an HTTP call.
Take a look at our [Documentation](https://docs.nango.dev/integrate/guides/perform-workflows-with-an-api)`,
            labels: ['automatic']
        }
    });

    return {
        status: res.status
    };
}
