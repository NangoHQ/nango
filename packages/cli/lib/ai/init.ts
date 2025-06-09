import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { getNangoRootPath, printDebug } from '../utils.js';
import { isArray } from 'node:util';

const srcPath = path.join(getNangoRootPath(), 'lib', 'ai', 'instructions', 'basics.md');
const supportedAgents = ['claude', 'cursor'];

export async function initAI({
    absolutePath,
    aiOpts,
    debug = false
}: {
    absolutePath: string;
    aiOpts: string[] | undefined;
    debug?: boolean;
}): Promise<boolean> {
    if (!isArray(aiOpts)) {
        printDebug(`Invalid options. Expected an array of AI agents.`, debug);
        return false;
    }

    const [validAgents, invalidAgents] = aiOpts.reduce<[string[], string[]]>(
        (acc, agent) => {
            if (supportedAgents.includes(agent)) {
                acc[0].push(agent);
            } else {
                acc[1].push(agent);
            }
            return acc;
        },
        [[], []]
    );
    if (invalidAgents.length > 0) {
        console.log(chalk.red(`Invalid AI agents provided: ${invalidAgents.join(', ')}. Supported agents are: ${supportedAgents.join(', ')}.`));
        return false;
    }

    for (const agent of validAgents) {
        if (agent === 'claude') {
            const ok = await initClaude({ absolutePath, debug });
            if (!ok) {
                return false;
            }
        } else if (agent === 'cursor') {
            const ok = await initCursor({ absolutePath, debug });
            if (!ok) {
                return false;
            }
        }
    }

    return true;
}

async function initCursor({ absolutePath, debug = false }: { absolutePath: string; debug: boolean }): Promise<boolean> {
    try {
        printDebug(`Creating the Cursor agent rules files in ${absolutePath}`, debug);
        const destPath = path.join(absolutePath, '.cursor', 'rules', 'nango.mdc');
        const stat = fs.statSync(destPath, { throwIfNoEntry: false });
        if (stat) {
            console.log(chalk.yellow(`${destPath} already exists. Skipping.`));
            return true;
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
        printDebug(`Creating the Claude agent instructions file in ${absolutePath}`, debug);
        const destPath = path.join(absolutePath, 'claude.md');

        const stat = fs.statSync(destPath, { throwIfNoEntry: false });
        if (stat) {
            console.log(chalk.yellow(`${destPath} already exists. Skipping.`));
            return true;
        }

        await fs.promises.copyFile(srcPath, destPath);
        return true;
    } catch (err) {
        console.error(chalk.red(`Failed to initialize Claude: ${err instanceof Error ? err.message : 'unknown error'}`));
        return false;
    }
}
