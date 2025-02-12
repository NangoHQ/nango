import { $ } from 'zx';
import type { Provider } from '@nangohq/types';
import yaml from 'js-yaml';

const primaryBranch = (await $`git remote show origin | grep \"HEAD branch\" | sed \"s/.*: //\"`.text()).trim();
const commits = await $`git log ${primaryBranch} --date=iso-strict --format=%cd`.lines();
let date = new Date(commits[commits.length - 1] as string);
const until = new Date(new Date().getTime());

let previousFlows: Record<string, any> | undefined = undefined;
const months: [Date, string[]][] = [];

while (true) {
    const sha = await $`git log ${primaryBranch} --until='${date.toISOString()}' -1 --format=format:%H`.text();
    if (!sha) {
        break;
    }

    const flows = await getFlows(sha);

    if (flows && previousFlows) {
        // const previous = Object.keys(previousFlows);
        // const current = Object.keys(providers);
        // const added = current.filter((provider) => !previous.includes(provider));
        // months.unshift([date, added]);
    }

    previousFlows = flows;

    if (date === until) {
        break;
    }

    // add two months since we drop back one second
    date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 1) - 1);
    if (date >= until) {
        date = until;
    }
}

if (!previousFlows) {
    console.log('No flows were loaded');
    process.exit(1);
}

console.log('# Pre-built Integrations Changelog');
console.log();
//console.log(`Nango supports ${Object.keys(previousProviders).length} providers`);
console.log();

for (const [date, added] of months) {
    console.log(`## ${date.toLocaleString('default', { timeZone: 'UTC', month: 'long', year: 'numeric' })}:`);
    console.log();
    //console.log(`${added.length} new providers`);
    // console.log();
    // for (const providerKey of added) {
    //     const provider = previousProviders[providerKey];

    //     console.log(`- [${provider?.display_name || providerKey}](/integrations/all/${providerKey})`);
    // }
    // console.log();
}

async function getFlows(sha: string): Promise<Record<string, any> | undefined> {
    const providersPackageYaml = await $`git show ${sha}:packages/shared/flows.yaml`.nothrow().quiet();
    if (providersPackageYaml.exitCode === 0) {
        return yaml.load(providersPackageYaml.toString()) as Record<string, any>;
    }

    return undefined;
}
