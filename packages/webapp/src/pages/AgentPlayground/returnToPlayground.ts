const RETURN_TO_PLAYGROUND = 'returnToPlayground';

export function returnToPlaygroundState(): Record<typeof RETURN_TO_PLAYGROUND, true> {
    return { [RETURN_TO_PLAYGROUND]: true };
}

export function returnsToPlayground(state: unknown): boolean {
    return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[RETURN_TO_PLAYGROUND] === true;
}
