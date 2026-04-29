import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import promptly from 'promptly';

import { printDebug } from '../utils.js';

export async function checkExistingFiles(
    fullPath: string,
    files: { relativePath: string; isScript: boolean }[],
    force: boolean,
    autoConfirm: boolean,
    debug: boolean,
    interactive = true
): Promise<{ proceed: boolean; filesToSkip: Set<string> }> {
    const existingFiles: string[] = [];
    const filesToSkip = new Set<string>();

    for (const file of files) {
        const localPath = path.join(fullPath, file.relativePath);
        if (fs.existsSync(localPath)) {
            existingFiles.push(file.relativePath);
        }
    }

    if (existingFiles.length === 0) {
        return { proceed: true, filesToSkip };
    }

    if (force) {
        printDebug(`Force mode: overwriting ${existingFiles.length} existing files`, debug);
        return { proceed: true, filesToSkip };
    }

    console.log(chalk.yellow(`\nThe following files already exist:`));
    for (const file of existingFiles) {
        console.log(chalk.yellow(`  - ${file}`));
    }

    if (autoConfirm) {
        console.log(chalk.yellow(`Auto-confirm enabled: overwriting files`));
        return { proceed: true, filesToSkip };
    }

    if (!interactive) {
        console.log(chalk.red('Existing files found and not running interactively. Re-run with --force to overwrite or --auto-confirm.'));
        return { proceed: false, filesToSkip };
    }

    const answer = await promptly.prompt(chalk.yellow(`\nDo you want to overwrite these files? (yes/no/skip): `), { default: 'no' });

    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        return { proceed: true, filesToSkip };
    }

    if (answer.toLowerCase() === 'skip' || answer.toLowerCase() === 's') {
        for (const file of existingFiles) {
            filesToSkip.add(file);
        }
        return { proceed: true, filesToSkip };
    }

    return { proceed: false, filesToSkip };
}

export async function updateIndexFile(fullPath: string, files: { relativePath: string; isScript: boolean }[], debug: boolean): Promise<void> {
    const indexPath = path.join(fullPath, 'index.ts');
    let indexContent = '';

    if (fs.existsSync(indexPath)) {
        indexContent = await fs.promises.readFile(indexPath, 'utf-8');
    }

    const scriptFiles = files.filter((f) => f.isScript && f.relativePath.endsWith('.ts'));
    const newImports: string[] = [];

    for (const file of scriptFiles) {
        const importPath = './' + file.relativePath.replace(/\.ts$/, '.js');
        const importStatement = `import '${importPath}';`;

        if (!indexContent.includes(importPath)) {
            newImports.push(importStatement);
        }
    }

    if (newImports.length > 0) {
        printDebug(`Adding ${newImports.length} new imports to index.ts`, debug);
        const updatedContent = indexContent.trim() + '\n' + newImports.join('\n') + '\n';
        await fs.promises.writeFile(indexPath, updatedContent, 'utf-8');
    }
}
