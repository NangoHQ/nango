import * as babel from '@babel/core';

import { CompileError } from './utils.js';

export function hasToolDefinition(ast: babel.types.File): boolean {
    // Look for export default createTool(...) or a default-exported variable initialized with createTool(...)
    return findToolDefinition(ast) !== undefined;
}

function findToolDefinition(ast: babel.types.File): babel.types.CallExpression | undefined {
    const t = babel.types;
    const exported = ast.program.body.find((node) => t.isExportDefaultDeclaration(node));
    if (!exported) {
        return undefined;
    }
    const isToolCall = (node: babel.types.Node | null | undefined): node is babel.types.CallExpression =>
        t.isCallExpression(node) && t.isIdentifier(node.callee, { name: 'createTool' });

    // Default export is a direct createTool call
    if (isToolCall(exported.declaration)) {
        return exported.declaration;
    }

    // Export is a reference; resolve its initializer
    if (!t.isIdentifier(exported.declaration)) {
        return undefined;
    }
    const name = exported.declaration.name;
    const declarator = ast.program.body
        .flatMap((node) => {
            const declaration = t.isExportNamedDeclaration(node) ? node.declaration : node;
            return t.isVariableDeclaration(declaration) ? declaration.declarations : [];
        })
        .find((node) => t.isIdentifier(node.id, { name }));
    const initializer = declarator?.init;
    return isToolCall(initializer) ? initializer : undefined;
}

/** Normalize tool declarations before the ordinary function compiler runs. */
export function normalizeToolDefinition(ast: babel.types.File): void {
    const toolDefinition = findToolDefinition(ast);
    if (!toolDefinition) {
        return;
    }
    const t = babel.types;
    babel.traverse(ast, {
        CallExpression(callPath) {
            if (callPath.node !== toolDefinition) {
                return;
            }
            const arg = toolDefinition.arguments[0];
            if (!t.isObjectExpression(arg)) {
                throw new CompileError('nango_invalid_function_param', toolDefinition.loc?.start.line ?? 0, 'Invalid function parameter, should be an object');
            }
            const program = callPath.findParent((parent) => parent.isProgram());
            if (!program?.isProgram()) {
                throw new Error('Tool definition must be inside a program');
            }

            // Keep the original props for CLI validation without changing when they are evaluated.
            const definition = program.scope.generateUidIdentifier('toolDefinition');
            const variable = t.variableDeclaration('let', [t.variableDeclarator(definition)]);
            const exported = t.exportNamedDeclaration(null, [t.exportSpecifier(definition, t.identifier('__nangoToolDefinition'))]);
            (exported as babel.types.ExportNamedDeclaration & { __transformedByRemoveCreateWrappers?: boolean }).__transformedByRemoveCreateWrappers = true;
            const statement = callPath.getStatementParent();
            statement?.insertBefore([variable, exported]);

            const functionProps = babel.template.expression(`
                ({
                    description: DESCRIPTION,
                    input: DEFINITION.input,
                    output: DEFINITION.output,
                    trigger: { kind: 'http' },
                    tags: {
                        ...DEFINITION.meta?.tags,
                        ...(DEFINITION.meta?.instructions !== undefined
                            ? { instructions: DEFINITION.meta.instructions }
                            : {}),
                        ...(DEFINITION.meta?.requiredScopes !== undefined
                            ? { required_scopes: DEFINITION.meta.requiredScopes }
                            : {})
                    },
                    exec: DEFINITION.exec
                })
            `)({
                DEFINITION: definition,
                DESCRIPTION: t.memberExpression(t.assignmentExpression('=', definition, arg), t.identifier('description'))
            });
            const normalized = t.callExpression(t.identifier('createFunction'), [functionProps]);
            callPath.replaceWith(normalized);
            callPath.stop();
        }
    });
}
