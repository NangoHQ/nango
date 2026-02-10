export function getCheckpointKey(opts: { type: 'sync' | 'webhook' | 'action' | 'on-event'; name: string; variant?: string | undefined }) {
    return `${opts.type}:${opts.name}${opts.variant ? `:${opts.variant}` : ''}`;
}
