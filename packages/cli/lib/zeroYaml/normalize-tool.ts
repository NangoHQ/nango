import fs from 'node:fs';
import path from 'node:path';

import * as babel from '@babel/core';

import { CompileError } from './utils.js';

/** Normalize tool declarations before the ordinary function compiler runs. */
export function normalizeToolDefinition({ source, filename, entryPoint }: { source: string; filename: string; entryPoint: string }): babel.types.File {
    const realEntryPoint = fs.realpathSync(path.resolve(entryPoint.replace(/\.js$/, '.ts')));
    const result = babel.transformSync(source, {
        filename,
        ast: true,
        code: false,
        parserOpts: { sourceType: 'module', plugins: ['typescript'] },
        plugins: [
            ({ types: t }: { types: typeof babel.types }): babel.PluginObj => ({
                visitor: {
                    ExportDefaultDeclaration(astPath) {
                        if (path.resolve(filename.replace(/\.js$/, '.ts')) !== realEntryPoint) {
                            return;
                        }
                        const declaration = astPath.node.declaration;
                        const binding = t.isIdentifier(declaration) ? astPath.scope.getBinding(declaration.name) : undefined;
                        const initializer = binding?.path.isVariableDeclarator() ? binding.path.node.init : declaration;
                        if (!t.isCallExpression(initializer) || !t.isIdentifier(initializer.callee, { name: 'createTool' })) {
                            return;
                        }
                        const arg = initializer.arguments[0];
                        if (!t.isObjectExpression(arg)) {
                            throw new CompileError(
                                'nango_invalid_function_param',
                                initializer.loc?.start.line ?? 0,
                                'Invalid function parameter, should be an object'
                            );
                        }
                        const program = astPath.findParent((parent) => parent.isProgram());
                        if (!program?.isProgram()) {
                            throw new Error('Tool definition must be inside a program');
                        }

                        // Keep the original props for CLI validation without changing when they are evaluated.
                        const definition = program.scope.generateUidIdentifier('toolDefinition');
                        const variable = t.variableDeclaration('let', [t.variableDeclarator(definition)]);
                        const exported = t.exportNamedDeclaration(null, [t.exportSpecifier(definition, t.identifier('__nangoToolDefinition'))]);
                        (
                            exported as babel.types.ExportNamedDeclaration & { __transformedByRemoveCreateWrappers?: boolean }
                        ).__transformedByRemoveCreateWrappers = true;
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
                }
            })
        ]
    });
    if (!result?.ast) {
        throw new Error(`Could not parse ${filename}`);
    }
    return result.ast;
}
