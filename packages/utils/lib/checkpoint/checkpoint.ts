export function getCheckpointKey(opts: { type: 'function' | 'sync' | 'webhook' | 'action' | 'on-event'; name: string; variant?: string | undefined }) {
    return `${opts.type}:${opts.name}${opts.variant ? `:${opts.variant}` : ''}`;
}
