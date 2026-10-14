import * as babel from '@babel/core';

import { CompileError } from './utils.js';

export function hasToolDefinition(ast: babel.types.File): boolean {
    const t = babel.types;
    const exported = ast.program.body.find((node) => t.isExportDefaultDeclaration(node));
    if (!t.isExportDefaultDeclaration(exported)) {
        return false;
    }
    const isToolCall = (node: babel.types.Node | null | undefined) => t.isCallExpression(node) && t.isIdentifier(node.callee, { name: 'createTool' });
    if (isToolCall(exported.declaration)) {
        return true;
    }
    if (!t.isIdentifier(exported.declaration)) {
        return false;
    }
    const name = exported.declaration.name;
    for (const node of ast.program.body) {
        const declaration = t.isExportNamedDeclaration(node) ? node.declaration : node;
        if (!t.isVariableDeclaration(declaration)) {
            continue;
        }
        const binding = declaration.declarations.find((node) => t.isIdentifier(node.id, { name }));
        if (binding) {
            return isToolCall(binding.init);
        }
    }
    return false;
}

/** Normalize tool declarations before the ordinary function compiler runs. */
export function normalizeToolDefinition(ast: babel.types.File): void {
    const t = babel.types;
    babel.traverse(ast, {
        ExportDefaultDeclaration(astPath) {
            const declaration = astPath.node.declaration;
            const binding = t.isIdentifier(declaration) ? astPath.scope.getBinding(declaration.name) : undefined;
            const initializer = binding?.path.isVariableDeclarator() ? binding.path.node.init : declaration;
            if (!t.isCallExpression(initializer) || !t.isIdentifier(initializer.callee, { name: 'createTool' })) {
                return;
            }
            const arg = initializer.arguments[0];
            if (!t.isObjectExpression(arg)) {
                throw new CompileError('nango_invalid_function_param', initializer.loc?.start.line ?? 0, 'Invalid function parameter, should be an object');
            }
            const program = astPath.findParent((parent) => parent.isProgram());
            if (!program?.isProgram()) {
                throw new Error('Tool definition must be inside a program');
            }

            // Keep the original props for CLI validation without changing when they are evaluated.
            const definition = program.scope.generateUidIdentifier('toolDefinition');
            const variable = t.variableDeclaration('let', [t.variableDeclarator(definition)]);
            const exported = t.exportNamedDeclaration(null, [t.exportSpecifier(definition, t.identifier('__nangoToolDefinition'))]);
            (exported as babel.types.ExportNamedDeclaration & { __transformedByRemoveCreateWrappers?: boolean }).__transformedByRemoveCreateWrappers = true;
            const statement = binding?.path.isVariableDeclarator() ? binding.path.parentPath : astPath;
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
            if (binding?.path.isVariableDeclarator()) {
                binding.path.get('init').replaceWith(normalized);
            } else {
                astPath.get('declaration').replaceWith(normalized);
            }
        }
    });
}
