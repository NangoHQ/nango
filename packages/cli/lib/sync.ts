import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import chalk from 'chalk';

import type { NangoConfig } from '@nangohq/shared';
import { convertConfigObject } from '@nangohq/shared';
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
            tickets: {
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

export const checkConfiguration = () => {
    const cwd = process.cwd();
    const configContents = fs.readFileSync(path.resolve(cwd, `./nango-integrations/${configFile}`), 'utf8');
    const configData: NangoConfig = yaml.load(configContents) as unknown as NangoConfig;

    const config = convertConfigObject(configData);

    return config;
};
