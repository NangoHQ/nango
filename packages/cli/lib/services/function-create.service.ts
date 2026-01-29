import fs from 'fs';
import path from 'path';

import chalk from 'chalk';

import { templateFolder } from '../zeroYaml/constants.js';

import type { FunctionType } from '../types.js';

export async function create({
    absolutePath,
    functionType,
    integration,
    name
}: {
    absolutePath: string;
    functionType?: FunctionType;
    integration: string | undefined;
    name: string | undefined;
}): Promise<boolean> {
    try {
        if (!functionType) {
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
                templateFile = path.join(templateFolder, 'sync.ts');
                break;
            case 'action':
                templateFile = path.join(templateFolder, 'action.ts');
                break;
            case 'on-event':
                templateFile = path.join(templateFolder, 'on-event.ts');
                break;
        }

        if (!fs.existsSync(templateFile)) {
            console.log(chalk.red('Invalid function type.'));
            return false;
        }

        const formattedFunctionType = `${functionType}s`;
        const targetDir = path.join(absolutePath, integration, formattedFunctionType);
        await fs.promises.mkdir(targetDir, { recursive: true });

        // Read the template file
        const templateContent = await fs.promises.readFile(templateFile, 'utf-8');

        const targetFile = path.join(targetDir, `${name}.ts`);

        // Check if file already exists
        if (fs.existsSync(targetFile)) {
            console.log(chalk.red(`File already exists: ${targetFile}`));
            return false;
        }

        const indexContent = `import './${integration}/${formattedFunctionType}/${name}.js';`;

        const indexFile = path.join(absolutePath, 'index.ts');

        await fs.promises.appendFile(indexFile, `\n${indexContent}`);

        await fs.promises.writeFile(targetFile, templateContent);

        console.log(chalk.green(`Created ${functionType}: ${targetFile}`));
        return true;
    } catch (err) {
        console.log(chalk.red(`Error creating ${name}:`, err instanceof Error ? err.message : 'Unknown error'));
        return false;
    }
}
