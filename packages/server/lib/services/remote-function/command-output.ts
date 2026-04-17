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

export function combineCommandOutput({ stdout, stderr }: { stdout?: string | undefined; stderr?: string | undefined }): string {
    return [stdout, stderr]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map((value) => value.trimEnd())
        .filter((value, index, parts) => value && parts.indexOf(value) === index)
        .join('\n');
}
