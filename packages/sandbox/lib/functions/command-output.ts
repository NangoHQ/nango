import type { DeployedFunction } from '@nangohq/types';

export function getCommandOutput(error: unknown, fallback: string): string {
    if (!error || typeof error !== 'object') {
        return fallback;
    }

    const err = error as Record<string, unknown>;
    const output = combineCommandOutput({
        stdout: typeof err['stdout'] === 'string' ? err['stdout'] : undefined,
        stderr: typeof err['stderr'] === 'string' ? err['stderr'] : undefined
    });
    if (output) {
        return output;
    }

    return typeof err['message'] === 'string' && err['message'] ? err['message'] : fallback;
}

/**
 * Builds a readable diagnostic from command streams.
 * This intentionally does not preserve interleaving; it keeps stdout first,
 * appends stderr, and drops stderr when both streams are identical.
 */
export function combineCommandOutput({ stdout, stderr }: { stdout?: string | undefined; stderr?: string | undefined }): string {
    return [stdout, stderr]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map((value) => value.trimEnd())
        .filter((value, index, parts) => value && parts.indexOf(value) === index)
        .join('\n');
}

/**
 * Returns only stdout for successful dryruns because the CLI prints the action result JSON there.
 * Successful user warnings may go to stderr, and appending them would corrupt result parsing.
 */
export function getDryrunCommandSuccessOutput({ stdout }: { stdout?: string | undefined; stderr?: string | undefined }): string {
    return stdout?.trimEnd() ?? '';
}

export interface DryrunSuccessOutput {
    output: string;
    hasResult: boolean;
    result?: unknown;
}

/**
 * Extracts the action return value printed by the CLI after the final Done line.
 * The remaining execution text is kept separately for callers that still need it.
 */
export function parseDryrunSuccessOutput(output: string): DryrunSuccessOutput {
    const executionOutput = stripBeforeFirst(output, /^Executing ->/);
    const lines = splitLines(executionOutput);
    const doneIndex = findLastLineIndex(lines, (line) => line.trim() === 'Done');

    if (doneIndex === -1) {
        return { output: executionOutput, hasResult: false };
    }

    const possibleResult = lines
        .slice(doneIndex + 1)
        .join('\n')
        .trim();
    if (!possibleResult || possibleResult === 'no output') {
        return {
            output: lines
                .slice(0, doneIndex + 1)
                .join('\n')
                .trim(),
            hasResult: false
        };
    }

    try {
        return {
            output: lines
                .slice(0, doneIndex + 1)
                .join('\n')
                .trim(),
            hasResult: true,
            result: JSON.parse(possibleResult)
        };
    } catch {
        return { output: executionOutput, hasResult: false };
    }
}

export interface DeploySuccessOutput {
    output: string;
    deployed: boolean;
    deployedFunctions: DeployedFunction[];
}

export function parseDeploySuccessOutput(output: string): DeploySuccessOutput {
    const deploymentOutput = stripBeforeFirst(output, /^✓ Packaging$|^✓ Acquiring remote state/);

    return {
        output: deploymentOutput,
        deployed: /✓ Deployed|Successfully deployed:/i.test(deploymentOutput),
        deployedFunctions: parseDeployedFunctions(deploymentOutput)
    };
}

function parseDeployedFunctions(output: string): DeployedFunction[] {
    const lines = splitLines(output).map((line) => line.trim());
    const start = lines.findIndex((line) => line.startsWith('Successfully deployed:'));
    if (start === -1) {
        return [];
    }

    const deployedFunctions: DeployedFunction[] = [];
    for (const line of lines.slice(start + 1)) {
        const match = /^- (?:.+? → )?([^@\s]+)(?:@v(\S+))?$/.exec(line);
        if (!match?.[1]) {
            break;
        }
        deployedFunctions.push(match[2] ? { name: match[1], version: match[2] } : { name: match[1] });
    }
    return deployedFunctions;
}

function stripBeforeFirst(output: string, pattern: RegExp): string {
    const lines = splitLines(output);
    const index = lines.findIndex((line) => pattern.test(line));

    return lines
        .slice(index === -1 ? 0 : index)
        .join('\n')
        .trim();
}

function splitLines(output: string): string[] {
    return output.trim().split(/\r?\n/);
}

function findLastLineIndex(lines: string[], predicate: (line: string) => boolean): number {
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line !== undefined && predicate(line)) {
            return i;
        }
    }

    return -1;
}
