import type { NangoSync, GithubWriteFileInput, GithubWriteFileActionResult } from '../../models';

export default async function runAction(nango: NangoSync, input: GithubWriteFileInput): Promise<GithubWriteFileActionResult> {
    const endpoint = `/repos/${input.owner}/${input.repo}/contents/${input.path}`;

    let fileSha: string | undefined = undefined;

    try {
        const file = await nango.get({
            endpoint: endpoint
        });

        fileSha = file && file.data && file.data.sha ? file.data.sha : undefined;
    } catch {
        // File does not exist
    }

    await nango.log(fileSha ? 'File exists, updating.' : 'File does not exist, creating new file.');

    const resp = await nango.proxy({
        method: 'PUT',
        endpoint: endpoint,
        data: {
            message: input.message,
            content: Buffer.from(input.content).toString('base64'),
            sha: fileSha
        }
    });

    return {
        url: resp.data.content.html_url,
        status: resp.status == 200 || resp.status == 201 ? 'success' : 'failure',
        sha: resp.data.content.sha
    };
}
