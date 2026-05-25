// Import as raw string so TypeScript doesn't infer a type from the 3k-line JSON
// (which causes ESLint's type-aware pass to OOM in CI). At runtime Vite handles
// the ?raw suffix; JSON.parse gives us the object we cast to TokensJson below.
import rawTokensStr from './tokens.json?raw';

/** A leaf token — carries a resolved $value and a $type */
export interface TokenLeaf {
    $value: string | Record<string, string>;
    $type: string;
    $description?: string;
}

/** A token group — non-$ children are TokenNodes */
export interface TokenGroup {
    [key: string]: TokenNode;
}

/** Either a leaf token or a nested group */
export type TokenNode = TokenLeaf | TokenGroup;

/** Typed view of the top-level token sets used in stories */
export interface TokensJson {
    'Semantic/Light': TokenGroup;
    Primitives: { color: TokenGroup };
    Typography: TokenGroup;
}

export const tokens = JSON.parse(rawTokensStr) as TokensJson;

/** True when a node is a leaf token (has a $value) */
export function isLeaf(node: TokenNode): node is TokenLeaf {
    return '$value' in node;
}

/** All non-metadata entries of a token group (strips $ keys) */
export function entries(group: TokenGroup): [string, TokenNode][] {
    return Object.entries(group).filter(([k]) => !k.startsWith('$'));
}
