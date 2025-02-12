import { $ } from 'zx';
import type { Provider } from '@nangohq/types';
import yaml from 'js-yaml';

interface ProviderSummary {
    name: string;
    provider: Provider;
}

const primaryBranch = (await $`git remote show origin | grep \"HEAD branch\" | sed \"s/.*: //\"`.text()).trim();
const commits = await $`git log ${primaryBranch} --date=iso-strict --format=%cd`.lines();
let date = new Date(commits[commits.length - 1] as string);
const until = new Date();

let previousProviders: Record<string, Provider> | undefined = undefined;
const months: [Date, ProviderSummary[]][] = [];

while (true) {
    const sha = await $`git log ${primaryBranch} --until='${date.toISOString()}' -1 --format=format:%H`.text();
    if (!sha) {
        break;
    }

    const providers = await getProviders(sha);

    if (providers && previousProviders) {
        const previous = Object.keys(previousProviders);
        const current = Object.keys(providers);

        const added = current.filter((provider) => !previous.includes(provider));

        months.unshift([
            date,
            added.map((provider) => ({
                name: provider,
                provider: (providers[provider] as any)['alias'] ? providers[(providers[provider] as any)['alias']]! : providers[provider]!
            }))
        ]);
    }

    previousProviders = providers;

    if (date === until) {
        break;
    }

    date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    if (date > until) {
        date = until;
    }
}

for (const [date, providerSummaries] of months) {
    console.log(`## ${date.toLocaleString('default', { month: 'long', year: 'numeric' })}:`);
    console.log();
    console.log(`${providerSummaries.length} new providers`);
    console.log();
    for (const providerSummary of providerSummaries) {
        console.log(`- [${providerSummary.provider.display_name || providerSummary.name}](/integrations/all/${providerSummary.name})`);
    }
    console.log();
}

async function getProviders(sha: string): Promise<Record<string, Provider> | undefined> {
    const providersPackageYaml = await $`git show ${sha}:packages/providers/providers.yaml`.nothrow().quiet();
    if (providersPackageYaml.exitCode === 0) {
        return yaml.load(providersPackageYaml.toString()) as Record<string, Provider>;
    }

    const sharedPackageYaml = await $`git show ${sha}:packages/shared/providers.yaml`.nothrow().quiet();
    if (sharedPackageYaml.exitCode === 0) {
        return yaml.load(sharedPackageYaml.toString()) as Record<string, Provider>;
    }

    return undefined;
}
