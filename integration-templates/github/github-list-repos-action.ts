import type { NangoSync, GithubRepo } from './models';

export default async function runAction(nango: NangoSync): Promise<{ repos: GithubRepo[] }> {
    let allRepos: any[] = [];

    // Fetch user's personal repositories.
    const personalRepos = await paginate(nango, '/user/repos');
    allRepos = allRepos.concat(personalRepos);

    // Fetch organizations the user is a part of.
    const organizations = await paginate(nango, '/user/orgs');

    // For each organization, fetch its repositories.
    for (const org of organizations) {
        const orgRepos = await paginate(nango, `/orgs/${org.login}/repos`);
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

async function paginate(nango: NangoSync, endpoint: string) {
    const MAX_PAGE = 100;

    let results: any[] = [];
    let page = 1;

    while (true) {
        const resp = await nango.get({
            endpoint: endpoint,
            params: {
                limit: `${MAX_PAGE}`,
                page: `${page}`
            }
        });

        results = results.concat(resp.data);

        if (resp.data.length == MAX_PAGE) {
            page += 1;
        } else {
            break;
        }
    }

    return results;
}
