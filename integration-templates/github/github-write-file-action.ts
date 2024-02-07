import type { NangoSync } from './models';

interface FileActionInput {
    owner: string; // Owner of the repository
    repo: string; // Name of the repository
    path: string; // File path including the name, e.g. 'README.md'
    message: string; // Commit message
    content: string; // Content to be saved, should be Base64 encoded
    sha?: string; // SHA of the file to update, required if updating
}

interface GithubWriteFileActionResult {
    url: string; // URL of the file
    status: string; // 'success' or 'failure'
    sha: string; // SHA of the file to update, required if updating
}

export default async function runAction(nango: NangoSync, input: FileActionInput): Promise<GithubWriteFileActionResult> {
    const endpoint = `/repos/${input.owner}/${input.repo}/contents/${input.path}`;

    let fileSha: string | undefined = undefined;

    try {
        const file = await nango.get({
            endpoint: endpoint
        });

        fileSha = file && file.data && file.data.sha ? file.data.sha : undefined;
    } catch (_) {}

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
