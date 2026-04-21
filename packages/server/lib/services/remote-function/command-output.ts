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

export function isCompilationFailureOutput(output: string): boolean {
    return /✗ Typechecking|Found \d+ errors?/i.test(output);
}

/**
 * Detects older CLI dryrun failures that can exit 0 after writing an error.
 * When that happens, return the combined streams so the API can surface it as a dryrun_error.
 */
export function getDryrunCommandErrorOutput({ stdout, stderr }: { stdout?: string | undefined; stderr?: string | undefined }): string | undefined {
    const output = combineCommandOutput({ stdout, stderr });
    if (!output) {
        return undefined;
    }

    if (/An error occurred during execution|Connection not found|No script matched/i.test(output)) {
        return output;
    }

    return undefined;
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
    deployedFunctions: { name: string; version: string }[];
}

export function parseDeploySuccessOutput(output: string): DeploySuccessOutput {
    const deploymentOutput = stripBeforeFirst(output, /^✓ Packaging$|^✓ Acquiring remote state/);

    return {
        output: deploymentOutput,
        deployed: /✓ Deployed|Successfully deployed the functions:/i.test(deploymentOutput),
        deployedFunctions: [...deploymentOutput.matchAll(/^- ([^@\n]+)@([^\s]+)/gm)].map((match) => ({
            name: (match[1] ?? '').trim(),
            version: (match[2] ?? '').trim()
        }))
    };
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
