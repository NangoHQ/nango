import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import chalk from 'chalk';

import type { NangoConfig } from '@nangohq/shared';
import { Nango, loadNangoConfig, getIntegrationClass, getServerBaseUrl } from '@nangohq/shared';
export const configFile = 'nango.yaml';

const dir = 'nango-integrations';

export const init = () => {
    const data: NangoConfig = {
        integrations: {
            'github-prod': {
                'github-users': {
                    runs: 'every hour',
                    returns: ['users']
                },
                'github-issues': {
                    runs: 'every half hour',
                    returns: ['issues']
                }
            },
            'asana-dev': {
                'asana-projects': {
                    runs: 'every hour',
                    returns: ['projects']
                }
            }
        },
        models: {
            issues: {
                id: 'integer',
                title: 'char',
                description: 'char',
                status: 'char',
                author: {
                    avatar_url: 'char'
                }
            },
            projects: {
                id: 'integer',
                type: 'char'
            },
            users: {
                id: 'integer',
                name: 'char'
            }
        }
    };
    const yamlData = yaml.dump(data);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    fs.writeFileSync(`${dir}/${configFile}`, yamlData);

    console.log(chalk.green(`${configFile} file has been created`));
};

export const run = async (args: string[]) => {
    const [syncName, providerConfigKey, connectionId, lastSyncDate] = args;
    const cwd = process.cwd();
    const config = loadNangoConfig(path.resolve(cwd, `./nango-integrations/${configFile}`));

    if (
        config?.integrations?.[providerConfigKey as string]?.[syncName as string] &&
        fs.existsSync(path.resolve(cwd, `./nango-integrations/dist/${syncName}.js`))
    ) {
        // to load a module without having to edit the type in the package.json
        // edit the file to be a mjs then rename it back
        fs.renameSync(path.resolve(cwd, `./nango-integrations/dist/${syncName}.js`), path.resolve(cwd, `./nango-integrations/dist/${syncName}.mjs`));
        const integrationClass = await getIntegrationClass(
            syncName as string,
            path.resolve(cwd, `./nango-integrations/dist/${syncName}.mjs`) + `?v=${Math.random().toString(36).substring(3)}`
        );

        // look at the cli index on how to get the nangoConnection
        const nango = new Nango({
            host: getServerBaseUrl(),
            connectionId: String(nangoConnection?.connection_id),
            providerConfigKey: String(nangoConnection?.provider_config_key),
            // pass in the sync id and store the raw json in the database before the user does what they want with it
            // or use the connection ID to match it up
            // either way need a new table
            activityLogId: activityLogId as number //this is optional?
        });
        const userDefinedResults = await integrationClass.fetchData(nango);

        console.log(integrationClass);
        console.log(connectionId, lastSyncDate);
        //fs.renameSync(path.resolve(cwd, `./nango-integrations/dist/${syncName}.mjs`), path.resolve(cwd, `./nango-integrations/dist/${syncName}.js`));
    } else {
        console.log(chalk.red('Sync not found'));
    }
};
