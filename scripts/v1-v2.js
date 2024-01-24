import { readFileSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';

const args = process.argv.slice(2);

function extractScopes(description) {
    const scopeRegex = /Required scope\(s\): ([\w, ]+)/;
    const match = scopeRegex.exec(description);
    return match ? match[1].split(',').map((s) => s.trim()) : ['default'];
}

function convertYAML(inputYAML) {
    let data = yaml.load(inputYAML);

    if (data.integrations) {
        for (const integration in data.integrations) {
            if (data.integrations[integration]) {
                for (const taskName in data.integrations[integration]) {
                    const task = data.integrations[integration][taskName];

                    if (task.type === 'action') {
                        if (task.input) {
                            task.input = task.input;
                        }
                        if (task.returns) {
                            task.output = task.returns;
                        }
                        task.endpoint = `/${integration}/${taskName.replace(`${integration}-`, '')}`;

                        delete task.returns;
                        delete task.type;

                        // Initialize actions if not exists
                        if (!data.actions) {
                            data.integrations[integration].actions = {};
                        }
                        data.integrations[integration].actions[taskName] = task;

                        delete data.integrations[integration][taskName];
                    } else if (task.runs) {
                        task.output = task.returns ? task.returns[0] : null;
                        task.sync_type = 'full';
                        task.endpoint = `/${integration}/${taskName.replace(`${integration}-`, '')}`;

                        // Extract scopes from description
                        if (task.description) {
                            task.scopes = extractScopes(task.description);
                        }

                        delete task.type;
                        delete task.returns;

                        // Initialize syncs if not exists
                        if (!data.integrations[integration].syncs) {
                            data.integrations[integration].syncs = {};
                        }
                        data.integrations[integration].syncs[taskName] = task;

                        delete data.integrations[integration][taskName];
                    }
                }
            }
        }
    }
    return yaml.dump(data);
}

const inputYAML = readFileSync(args[0], 'utf8');

const outputYAML = convertYAML(inputYAML);
writeFileSync(args[0], outputYAML);
