import type { NangoSync, GithubRepoFile } from './models';

enum Models {
    GithubRepoFile = 'GithubRepoFile'
}

interface Metadata {
    owner: string;
    repo: string;
    branch: string;
}

const LIMIT = 100;

export default async function fetchData(nango: NangoSync) {
    const { owner, repo, branch } = await nango.getMetadata<Metadata>();

    // On the first run, fetch all files. On subsequent runs, fetch only updated files.
    if (!nango.lastSyncDate) {
        await saveAllRepositoryFiles(nango, owner, repo, branch);
    } else {
        await saveFileUpdates(nango, owner, repo, nango.lastSyncDate);
    }
}

async function saveAllRepositoryFiles(nango: NangoSync, owner: string, repo: string, branch: string) {
    let count = 0;

    const endpoint = `/repos/${owner}/${repo}/git/trees/${branch}`;
    const proxyConfig = {
        endpoint,
        params: { recursive: '1' },
        paginate: { response_path: 'tree', limit: LIMIT }
    };

    await nango.log(`Fetching files from endpoint ${endpoint}.`);

    for await (const fileBatch of nango.paginate(proxyConfig)) {
        const blobFiles = fileBatch.filter((item: any) => item.type === 'blob');
        count += blobFiles.length;
        await nango.batchSave(blobFiles.map(mapToFile), Models.GithubRepoFile);
    }
    await nango.log(`Got ${count} file(s).`);
}

async function saveFileUpdates(nango: NangoSync, owner: string, repo: string, since: Date) {
    const commitsSinceLastSync: any[] = await getCommitsSinceLastSync(owner, repo, since, nango);

    for (const commitSummary of commitsSinceLastSync) {
        await saveFilesUpdatedByCommit(owner, repo, commitSummary, nango);
    }
}

async function getCommitsSinceLastSync(owner: string, repo: string, since: Date, nango: NangoSync) {
    let count = 0;
    const endpoint = `/repos/${owner}/${repo}/commits`;

    const proxyConfig = {
        endpoint,
        params: { since: since.toISOString() },
        paginate: {
            limit: LIMIT
        }
    };

    await nango.log(`Fetching commits from endpoint ${endpoint}.`);

    const commitsSinceLastSync: any[] = [];
    for await (const commitBatch of nango.paginate(proxyConfig)) {
        count += commitBatch.length;
        commitsSinceLastSync.push(...commitBatch);
    }
    await nango.log(`Got ${count} commits(s).`);
    return commitsSinceLastSync;
}

async function saveFilesUpdatedByCommit(owner: string, repo: string, commitSummary: any, nango: NangoSync) {
    let count = 0;
    const endpoint = `/repos/${owner}/${repo}/commits/${commitSummary.sha}`;
    const proxyConfig = {
        endpoint,
        paginate: {
            response_data_path: 'files',
            limit: LIMIT
        }
    };

    await nango.log(`Fetching files from endpoint ${endpoint}.`);

    for await (const fileBatch of nango.paginate(proxyConfig)) {
        count += fileBatch.length;
        await nango.batchSave(fileBatch.filter((file: any) => file.status !== 'removed').map(mapToFile), Models.GithubRepoFile);
        await nango.batchDelete(fileBatch.filter((file: any) => file.status === 'removed').map(mapToFile), Models.GithubRepoFile);
    }
    await nango.log(`Got ${count} file(s).`);
}

function mapToFile(file: any): GithubRepoFile {
    return {
        id: file.sha,
        name: file.path || file.filename,
        url: file.url || file.blob_url,
        last_modified_date: file.committer?.date ? new Date(file.committer?.date) : new Date() // Use commit date or current date
    };
}
