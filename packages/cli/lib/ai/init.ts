import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import { z } from 'zod';

import { getNangoRootPath, printDebug } from '../utils.js';

const supportedAgents = ['claude', 'cursor'] as const;
const optsValidation = z.array(z.enum(supportedAgents));
const srcPath = path.join(getNangoRootPath(), 'lib', 'ai', 'instructions', 'basics.md');

export async function initAI({
    absolutePath,
    aiOpts,
    debug = false
}: {
    absolutePath: string;
    aiOpts: string[] | undefined;
    debug?: boolean;
}): Promise<boolean> {
    const agents = optsValidation.safeParse(aiOpts);

    if (!agents.success) {
        console.log(chalk.red(`Invalid AI options provided: expected one or more of '${supportedAgents.join(', ')}'`));
        return false;
    }

    let res = true;
    for (const agent of agents.data) {
        if (agent === 'claude') {
            const ok = await initClaude({ absolutePath, debug });
            if (!ok) {
                res = false;
            }
        } else if (agent === 'cursor') {
            const ok = await initCursor({ absolutePath, debug });
            if (!ok) {
                res = false;
            }
        }
    }

    return res;
}

async function initCursor({ absolutePath, debug = false }: { absolutePath: string; debug: boolean }): Promise<boolean> {
    try {
        const destPath = path.join(absolutePath, '.cursor', 'rules', 'nango.mdc');
        printDebug(`Copying Cursor agent rules files at ${destPath}`, debug);
        const stat = fs.statSync(destPath, { throwIfNoEntry: false });
        if (stat) {
            console.log(chalk.yellow(`${destPath} already exists. Skipping.`));
            return false;
        }
        await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
        const header = `---
description: Nango Custom Integration Development
globs:
alwaysApply: false
---

`;
        const fileContent = await fs.promises.readFile(srcPath, 'utf-8');
        await fs.promises.writeFile(destPath, header + fileContent, 'utf-8');
        return true;
    } catch (err) {
        console.error(chalk.red(`Failed to initialize Cursor: ${err instanceof Error ? err.message : 'unknown error'}`));
        return false;
    }
}

async function initClaude({ absolutePath, debug = false }: { absolutePath: string; debug: boolean }): Promise<boolean> {
    try {
        const destPath = path.join(absolutePath, 'claude.md');
        printDebug(`Copying Claude agent instructions file at ${destPath}`, debug);

        const stat = fs.statSync(destPath, { throwIfNoEntry: false });
        if (stat) {
            console.log(chalk.yellow(`${destPath} already exists. Skipping.`));
            return false;
        }

        await fs.promises.copyFile(srcPath, destPath);
        return true;
    } catch (err) {
        console.error(chalk.red(`Failed to initialize Claude: ${err instanceof Error ? err.message : 'unknown error'}`));
        return false;
    }
}
