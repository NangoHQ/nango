import fs from 'fs';
import path from 'path';

import chalk from 'chalk';

import { exampleFolder } from '../zeroYaml/constants.js';

export async function create({
    absolutePath,
    sync,
    action,
    onEvent,
    integration,
    name
}: {
    absolutePath: string;
    sync: boolean | undefined;
    action: boolean | undefined;
    onEvent: boolean | undefined;
    integration: string | undefined;
    name: string | undefined;
}): Promise<boolean> {
    try {
        let functionType: 'sync' | 'action' | 'on-event';
        if (sync) {
            functionType = 'sync';
        } else if (action) {
            functionType = 'action';
        } else if (onEvent) {
            functionType = 'on-event';
        } else {
            console.log(chalk.red('Must specify either --sync, --action, or --on-event'));
            return false;
        }

        if (!integration || !name) {
            console.log(chalk.red('Integration name and function name are required'));
            return false;
        }

        let templateFile: string;
        switch (functionType) {
            case 'sync':
                templateFile = path.join(exampleFolder, 'github', 'syncs', 'fetchIssues.ts');
                break;
            case 'action':
                templateFile = path.join(exampleFolder, 'github', 'actions', 'createIssue.ts');
                break;
            case 'on-event':
                templateFile = path.join(exampleFolder, 'github', 'on-events', 'pre-connection-deletion.ts');
                break;
        }

        if (!fs.existsSync(templateFile)) {
            console.log(chalk.red('Invalid function type.'));
            return false;
        }

        const targetDir = path.join(absolutePath, integration, functionType === 'on-event' ? 'on-events' : `${functionType}s`);
        await fs.promises.mkdir(targetDir, { recursive: true });

        // Read the template file
        const templateContent = await fs.promises.readFile(templateFile, 'utf-8');

        let customizedContent = templateContent;

        if (functionType === 'sync') {
            customizedContent = customizedContent
                .replace(/fetchIssues/g, name)
                .replace(/Fetches the Github issues from all a user's repositories\./g, `Fetches ${name} data.`)
                .replace(/GithubIssue/g, `${name.charAt(0).toUpperCase() + name.slice(1)}Record`)
                .replace(/issueSchema/g, `${name}Schema`)
                .replace(/GithubIssue\[\]/g, `${name.charAt(0).toUpperCase() + name.slice(1)}Record[]`);
        } else if (functionType === 'action') {
            customizedContent = customizedContent
                .replace(/createIssue/g, name)
                .replace(/Create an issue in GitHub/g, `Create ${name} in ${integration}`)
                .replace(/GithubIssue/g, `${name.charAt(0).toUpperCase() + name.slice(1)}Record`)
                .replace(/issueSchema/g, `${name}Schema`);
        } else if (functionType === 'on-event') {
            customizedContent = customizedContent
                .replace(/pre-connection-deletion/g, 'pre-connection-deletion') // Keep the event type
                .replace(/This script is executed before a connection is deleted/g, `This script is executed for ${name} event`);
        }

        const targetFile = path.join(targetDir, `${name}.ts`);

        // Check if file already exists
        if (fs.existsSync(targetFile)) {
            console.log(chalk.red(`File already exists: ${targetFile}`));
            return false;
        }

        await fs.promises.writeFile(targetFile, customizedContent);

        console.log(chalk.green(`Created ${functionType}: ${targetFile}`));
        return true;
    } catch (err) {
        console.log(chalk.red(`Error creating ${name}:`, err));
        return false;
    }
}
