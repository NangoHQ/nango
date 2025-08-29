import yaml from 'js-yaml';
import { $ } from 'zx';

import type { FlowZeroJson, Provider } from '@nangohq/types';

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
    if (flows && flows.length > 0) {
        const firstFlow = flows[0];
        if (firstFlow && (firstFlow.actions || firstFlow.syncs)) {
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

async function getFlows(sha: string): Promise<FlowZeroJson[] | undefined> {
    const flowsZeroJson = await $`git show ${sha}:packages/shared/flows.zero.json`.nothrow().quiet();
    if (flowsZeroJson.exitCode === 0) {
        return JSON.parse(flowsZeroJson.toString()) as FlowZeroJson[];
    }

    return undefined;
}

function formatFlows(flows: FlowZeroJson[]) {
    const out: Record<string, FormattedFlow> = {};

    for (const integration of flows) {
        const name = integration.providerConfigKey;
        if (!name) {
            continue;
        }

        if (integration.actions) {
            for (const action of integration.actions) {
                if (!action) {
                    continue;
                }

                const val = {
                    integration: name,
                    name: action.name,
                    endpoint: action.endpoint!.path,
                    method: action.endpoint!.method,
                    type: 'actions'
                };
                out[JSON.stringify(val)] = val;
            }
        }

        if (integration.syncs) {
            for (const sync of integration.syncs) {
                if (!sync) {
                    continue;
                }

                for (const endpoint of sync.endpoints) {
                    const val = {
                        integration: name,
                        name: sync.name,
                        endpoint: endpoint.path,
                        method: endpoint.method,
                        type: 'syncs'
                    };

                    out[JSON.stringify(val)] = val;
                }
            }
        }
    }

    return out;
}
