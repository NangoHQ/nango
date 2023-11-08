import type { NangoSync, GithubRepo } from './models';

const LIMIT = 100;

export default async function runAction(nango: NangoSync): Promise<{ repos: GithubRepo[] }> {
    let allRepos: any[] = [];

    // Fetch user's personal repositories.
    const personalRepos = await getAll(nango, '/user/repos');
    allRepos = allRepos.concat(personalRepos);

    // Fetch organizations the user is a part of.
    const organizations = await getAll(nango, '/user/orgs');

    // For each organization, fetch its repositories.
    for (const org of organizations) {
        const orgRepos = await getAll(nango, `/orgs/${org.login}/repos`);
        allRepos = allRepos.concat(orgRepos);
    }

    const mappedRepos: GithubRepo[] = allRepos.map((repo) => ({
        id: repo.id,
        owner: repo.owner.login,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        date_created: repo.created_at,
        date_last_modified: repo.updated_at
    }));

    return { repos: mappedRepos };
}

async function getAll(nango: NangoSync, endpoint: string) {
    const records: any[] = [];

    const proxyConfig = { endpoint, limit: LIMIT };
    for await (const recordBatch of nango.paginate(proxyConfig)) {
        records.push(...recordBatch);
    }

    return records;
}
