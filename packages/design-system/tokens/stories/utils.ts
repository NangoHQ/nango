import { entries, isLeaf } from '../types';

import type { TokenGroup, TokenLeaf, TokenNode } from '../types';

export function toKebab(s: string) {
    return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Walks a token group and yields every leaf with its full path from the given prefix. */
export function* leaves(group: TokenGroup, prefix: string[] = []): Generator<{ path: string[]; leaf: TokenLeaf }> {
    for (const [k, node] of entries(group)) {
        const path = [...prefix, k];
        if (isLeaf(node)) yield { path, leaf: node };
        else yield* leaves(node, path);
    }
}

/** True when every non-metadata child of a group is itself a leaf. */
export function isFlatGroup(group: TokenGroup): boolean {
    return entries(group).every(([, v]: [string, TokenNode]) => isLeaf(v));
}
