import type { NangoSync, GithubRepoFile } from './models';

enum PaginationType {
    RepoFile,
    CommitFile,
    Commit
}

enum Models {
    GithubRepoFile = 'GithubRepoFile'
}

interface Metadata {
    owner: string;
    repo: string;
    branch: string;
}

export default async function fetchData(nango: NangoSync) {
    const { owner, repo, branch } = await nango.getMetadata<Metadata>();

    // On the first run, fetch all files. On subsequent runs, fetch only updated files.
    if (!nango.lastSyncDate) {
        await getAllFilesFromRepo(nango, owner, repo, branch);
    } else {
        await getUpdatedFiles(nango, owner, repo, nango.lastSyncDate);
    }
}

async function getAllFilesFromRepo(nango: NangoSync, owner: string, repo: string, branch: string) {
    await paginate(nango, `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, PaginationType.RepoFile);
}

async function getUpdatedFiles(nango: NangoSync, owner: string, repo: string, since: Date) {
    const commitsSinceLastSync = await paginate(nango, `/repos/${owner}/${repo}/commits`, PaginationType.Commit, { since: since.toISOString() });

    for (const commitSummary of commitsSinceLastSync) {
        await paginate(nango, `/repos/${owner}/${repo}/commits/${commitSummary.sha}`, PaginationType.CommitFile);
    }
}

function mapToFile(file: any): GithubRepoFile {
    return {
        id: file.sha,
        name: file.path || file.filename,
        url: file.url || file.blob_url,
        last_modified_date: file.committer?.date ? new Date(file.committer?.date) : new Date() // Use commit date or current date
    };
}

async function paginate(nango: NangoSync, endpoint: string, type: PaginationType, params?: any): Promise<any[]> {
    let page = 1;
    const PER_PAGE = 100;
    const results: any[] = [];
    let count = 0;
    const objectType = type === PaginationType.Commit ? 'commit' : 'file';

    await nango.log(`Fetching ${objectType}(s) from endpoint ${endpoint}.`);

    while (true) {
        const response = await nango.get({
            endpoint: endpoint,
            params: {
                ...params,
                page: page,
                per_page: PER_PAGE
            }
        });

        switch (type) {
            case PaginationType.RepoFile:
                const files = response.data.tree.filter((item: any) => item.type === 'blob');
                count += files.length;
                await nango.batchSave(files.map(mapToFile), Models.GithubRepoFile);
                break;
            case PaginationType.CommitFile:
                count += response.data.files.length;
                await nango.batchSave(response.data.files.filter((file: any) => file.status !== 'removed').map(mapToFile), Models.GithubRepoFile);
                await nango.batchDelete(response.data.files.filter((file: any) => file.status === 'removed').map(mapToFile), Models.GithubRepoFile);
                break;
            case PaginationType.Commit:
                count += response.data.length;
                results.push(...response.data);
                break;
        }

        if (!response.headers.link || !response.headers.link.includes('rel="next"')) {
            break;
        }

        page++;
    }

    await nango.log(`Got ${count} ${objectType}(s).`);

    return results;
}
