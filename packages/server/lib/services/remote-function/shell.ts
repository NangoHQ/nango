export function quoteShellArg(value: string): string {
    return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildShellCommand(args: string[]): string {
    return args.map(quoteShellArg).join(' ');
}
