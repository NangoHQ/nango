import { $ } from 'zx';
import yaml from 'js-yaml';
import type { FlowsYaml, Provider } from '@nangohq/types';
// eslint-disable-next-line import/no-extraneous-dependencies
import { parseEndpoint } from '@nangohq/nango-yaml';

interface FormattedFlow {
    integration: string;
    name: string;
    endpoint: string;
    method: string;
    type: string;
}

const primaryBranch = (await $`git remote show origin | grep \"HEAD branch\" | sed \"s/.*: //\"`.text()).trim();
const commits = await $`git log ${primaryBranch} --date=iso-strict --format=%cd`.lines();
let date = new Date(commits[commits.length - 1] as string);
const until = new Date(new Date().getTime());

let previousFlows: Record<string, any> | undefined = undefined;
const months: [Date, FormattedFlow[]][] = [];

while (true) {
    const sha = await $`git log ${primaryBranch} --until='${date.toISOString()}' -1 --format=format:%H`.text();
    if (!sha) {
        break;
    }

    const flows = await getFlows(sha);

    let canProcess = false;
    if (flows) {
        const firstFlow = Object.entries(flows.integrations)[0]?.[1] as any;
        if (firstFlow && (firstFlow['actions'] || firstFlow['syncs'])) {
            canProcess = true;
        }
    }

    const formattedFlows = canProcess && flows ? formatFlows(flows) : undefined;

    if (formattedFlows && previousFlows) {
        const previous = Object.keys(previousFlows);
        const current = Object.keys(formattedFlows);
        const added = current.filter((provider) => !previous.includes(provider));
        const vals = added.map((key) => formattedFlows[key]) as FormattedFlow[];

        months.unshift([date, vals]);
    }

    previousFlows = formattedFlows;

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

const latestProviders: Record<string, Provider> = yaml.load(await $`git show ${primaryBranch}:packages/providers/providers.yaml`.text()) as Record<
    string,
    Provider
>;

console.log('# Pre-built Integrations Changelog');
console.log();
console.log(`Nango supports ${Object.keys(previousFlows).length} pre-built use cases`);
console.log();

for (const [date, added] of months) {
    console.log(`## ${date.toLocaleString('default', { timeZone: 'UTC', month: 'long', year: 'numeric' })}:`);
    console.log();
    console.log(`${added.length} new endpoints`);

    let previousIntegration = undefined;
    for (const endpoint of added) {
        if (previousIntegration !== endpoint.integration) {
            const provider = latestProviders[endpoint.integration];

            console.log(``);
            console.log(`- [${provider ? provider.display_name : endpoint.integration}](/integrations/all/${endpoint.integration})`);
            previousIntegration = endpoint.integration;
        }

        console.log(
            `  - [${endpoint.method} ${endpoint.endpoint}](https://github.com/NangoHQ/integration-templates/blob/main/integrations/${endpoint.integration}/${endpoint.type}/${endpoint.name}.md)`
        );
    }
    console.log();
}

async function getFlows(sha: string): Promise<FlowsYaml | undefined> {
    const providersPackageYaml = await $`git show ${sha}:packages/shared/flows.yaml`.nothrow().quiet();
    if (providersPackageYaml.exitCode === 0) {
        return yaml.load(providersPackageYaml.toString()) as FlowsYaml;
    }

    return undefined;
}

function formatFlows(flows: FlowsYaml) {
    const out: Record<string, FormattedFlow> = {};

    for (const name of Object.keys(flows.integrations)) {
        const integration = flows.integrations[name];
        if (!integration) {
            continue;
        }

        if (integration.actions) {
            for (const actionName of Object.keys(integration.actions)) {
                const action = integration.actions[actionName];
                if (!action) {
                    continue;
                }

                const parsed = parseEndpoint(action.endpoint, 'POST');
                const val = {
                    integration: name,
                    name: actionName,
                    endpoint: parsed.path,
                    method: parsed.method,
                    type: 'actions'
                };
                out[JSON.stringify(val)] = val;
            }
        }

        if (integration.syncs) {
            for (const syncName of Object.keys(integration.syncs)) {
                const sync = integration.syncs[syncName];
                if (!sync) {
                    continue;
                }

                const endpoints = Array.isArray(sync.endpoint) ? sync.endpoint : [sync.endpoint];
                for (const endpoint of endpoints) {
                    const parsed = parseEndpoint(endpoint, 'GET');
                    const val = {
                        integration: name,
                        name: syncName,
                        endpoint: parsed.path,
                        method: parsed.method,
                        type: 'syncs'
                    };

                    out[JSON.stringify(val)] = val;
                }
            }
        }
    }

    return out;
}
