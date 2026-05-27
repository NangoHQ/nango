import * as parser from '@babel/parser';
import traverse from '@babel/traverse';

import type { NodePath, TraverseOptions } from '@babel/traverse';
import type { CallExpression, File, MemberExpression, Node as BabelNode } from '@babel/types';

type TraverseFunction = (parent: BabelNode, opts?: TraverseOptions) => void;

export interface DeployScriptScanHit {
    rule: 'constructor_string_call';
    start: number | null;
    end: number | null;
}

export type DeployScriptScanResult =
    | { ok: true }
    | { ok: false; rule: 'constructor_string_call'; hits: DeployScriptScanHit[] }
    | { ok: false; rule: 'parse_error'; message: string };

/** Max AST nodes visited while flattening a static `+` chain (abuse guard, not a depth limit). */
const MAX_STATIC_STRING_NODES = 64;

/**
 * If `expr` is only string literals / template literals joined by `+`, returns the concatenated value.
 * Flattens left- or right-associative `+` trees iteratively so long chains like `['c'+'o'+…+'r']` are not missed.
 */
function evalStaticString(expr: BabelNode): string | null {
    const parts: string[] = [];
    const stack: BabelNode[] = [expr];
    let nodesVisited = 0;

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node) {
            continue;
        }
        nodesVisited += 1;
        if (nodesVisited > MAX_STATIC_STRING_NODES) {
            return null;
        }

        if (node.type === 'StringLiteral') {
            parts.push(node.value);
            continue;
        }

        if (node.type === 'TemplateLiteral') {
            if (node.expressions.length > 0) {
                return null;
            }
            parts.push(node.quasis.map((q) => q.value.cooked ?? q.value.raw).join(''));
            continue;
        }

        if (node.type === 'BinaryExpression' && node.operator === '+') {
            stack.push(node.right);
            stack.push(node.left);
            continue;
        }

        return null;
    }

    return parts.join('');
}

/** `obj.constructor` or `obj["constructor"]` / `obj['constructor']` (same runtime property). */
function isConstructorMemberCallee(expr: BabelNode): expr is MemberExpression {
    if (expr.type !== 'MemberExpression') {
        return false;
    }
    if (expr.computed) {
        const p = expr.property;
        return evalStaticString(p) === 'constructor';
    }
    const prop = expr.property;
    return prop.type === 'Identifier' && prop.name === 'constructor';
}

function variableInitIsConstructorMember(declPath: NodePath): boolean {
    if (!declPath.isVariableDeclarator()) {
        return false;
    }
    const init = declPath.node.init;
    return Boolean(init && isConstructorMemberCallee(init));
}

/**
 * Detects high-signal dynamic code patterns in compiled CJS (e.g. `Error.constructor('return process')()`).
 * Does not flag normal bundler shims that use Object.getPrototypeOf without `.constructor(...)`.
 */
export function scanCompiledDeployScript(js: string): DeployScriptScanResult {
    let ast: File;
    try {
        ast = parser.parse(js, {
            sourceType: 'script',
            allowReturnOutsideFunction: true,
            errorRecovery: true
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, rule: 'parse_error', message };
    }

    const hits: DeployScriptScanHit[] = [];

    // Under `moduleResolution: "node16"`, default import from this CJS package is typed as the module namespace, not the callable (same workaround as packages/cli/lib/services/parser.service.ts).
    const traverseFn: TraverseFunction = (traverse as unknown as { default?: TraverseFunction }).default ?? (traverse as unknown as TraverseFunction);

    traverseFn(ast, {
        CallExpression(path: NodePath<CallExpression>) {
            const { node } = path;
            const callee = node.callee;

            // Any `*.constructor(<anything>)` or `*["constructor"](<anything>)` is the Function constructor gadget.
            if (isConstructorMemberCallee(callee) && node.arguments.length > 0) {
                hits.push({
                    rule: 'constructor_string_call',
                    start: node.start ?? null,
                    end: node.end ?? null
                });
                return;
            }

            // `const c = obj.constructor; c(payload)()` — callee is not a member `.constructor` node.
            if (callee.type === 'Identifier' && node.arguments.length > 0) {
                const binding = path.scope.getBinding(callee.name);
                const decl = binding?.path;
                if (decl && variableInitIsConstructorMember(decl)) {
                    hits.push({
                        rule: 'constructor_string_call',
                        start: node.start ?? null,
                        end: node.end ?? null
                    });
                }
            }
        }
    });

    if (hits.length === 0) {
        return { ok: true };
    }

    return { ok: false, rule: 'constructor_string_call', hits };
}
