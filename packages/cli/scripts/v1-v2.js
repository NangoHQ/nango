import { readFileSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';

const args = process.argv.slice(2);

function extractScopes(description) {
    const scopeRegex = /(?:Required )?scope\(s\): ([\w,:.-]+)/i;
    const match = scopeRegex.exec(description);
    return match ? match[1].split(',').map((s) => s.trim()) : '';
}

function convertYAML(inputYAML) {
    let data = yaml.load(inputYAML);
    const location = args[0].replace('nango.yaml', '');
    let changeLog = [];

    if (data.integrations) {
        for (const integration in data.integrations) {
            if (!data.integrations[integration]) {
                continue;
            }
            for (const taskName in data.integrations[integration]) {
                const task = data.integrations[integration][taskName];
                let change = { integration, taskName, changes: [] }; // Track changes for each task

                if (task.type === 'action') {
                    change.type = 'action';
                    if (task.returns) {
                        task.output = task.returns;
                        change.changes.push({
                            action: `Set output from returns for ${taskName}`,
                            explanation: `The returns field has been deprecated in v2 as it is potentially confusing. Syncs and actions now have an 'output' field. A sync's output is assumed to be an array.`
                        });
                    }
                    const scopes = extractScopes(task.description);
                    if (scopes) {
                        task.scopes = scopes;
                    }
                    task.endpoint = `/${integration}/${taskName.replace(`${integration}-`, '')}`;
                    change.changes.push({
                        action: `Set endpoint for ${taskName}`,
                        explanation: `Syncs and actions now have a REST endpoint which is user defined and can be called directly. A sync's HTTP method is assumed to be a GET and an action's HTTP method is assumed to be a POST.`
                    });

                    delete task.returns;
                    delete task.type;
                    change.changes.push({
                        action: 'Removed the type property',
                        explanation: `The type property has been deprecated in v2. Syncs and actions are now differentiated by a top level property at the integration level.`
                    });

                    if (!data.integrations[integration].actions) {
                        data.integrations[integration].actions = {};
                    }
                    data.integrations[integration].actions[taskName] = task;

                    delete data.integrations[integration][taskName];
                } else if (task.runs) {
                    change.type = 'sync';
                    if (Array.isArray(task.returns)) {
                        task.output = task.returns.length === 1 ? task.returns[0] : task.returns;
                    } else {
                        task.output = task.returns;
                    }
                    change.changes.push({
                        action: `Set output from returns for ${taskName}`,
                        explanation: `The returns field has been deprecated in v2 as it is potentially confusing. Syncs and actions now have an 'output' field. A sync's output is assumed to be an array.`
                    });
                    const contents = readFileSync(`./${location}${taskName}.ts`, 'utf8');
                    task.sync_type = contents.includes('lastSyncDate') ? 'incremental' : 'full';
                    if (Array.isArray(task.output)) {
                        task.endpoint = task.output.map((o) => `/${integration}/${taskName.replace(`${integration}-`, '')}/${o.toLowerCase()}`);
                    } else {
                        task.endpoint = `/${integration}/${taskName.replace(`${integration}-`, '')}`;
                    }
                    change.changes.push({
                        action: `Set endpoint for ${taskName}`,
                        explanation: `Syncs and actions now have a REST endpoint which is user defined and can be called directly. A sync's HTTP method is assumed to be a GET and an action's HTTP method is assumed to be a POST.`
                    });

                    if (task.description) {
                        const scopes = extractScopes(task.description);
                        if (scopes) {
                            task.scopes = scopes;
                        }
                        change.changes.push({
                            action: 'Extracted scopes from description',
                            explanation: `Scopes are now extracted from the description field and can be set as an array on the script`
                        });
                    }

                    delete task.type;
                    delete task.returns;

                    change.changes.push({
                        action: 'Removed the type property',
                        explanation: `The type property has been deprecated in v2. Syncs and actions are now differentiated by a top level property at the integration level.`
                    });
                    if (!data.integrations[integration].syncs) {
                        data.integrations[integration].syncs = {};
                    }
                    data.integrations[integration].syncs[taskName] = task;

                    delete data.integrations[integration][taskName];
                }
                if (change.changes.length > 0) {
                    changeLog.push(change);
                }
            }
        }
    }

    changeLog.forEach((log) => {
        console.log(`Integration: ${log.integration}, ${log.type}: ${log.taskName}`);
        log.changes.forEach((change) => {
            console.log(`- Action: ${change.action}`);
            console.log(`  Reason: ${change.explanation}`);
        });
        console.log();
    });

    return yaml.dump(data);
}

const inputYAML = readFileSync(args[0], 'utf8');

const outputYAML = convertYAML(inputYAML);
writeFileSync(args[0], outputYAML);
