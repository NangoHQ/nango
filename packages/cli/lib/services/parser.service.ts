import fs from 'fs';
import chalk from 'chalk';
import type { NodePath } from '@babel/traverse';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import parser from '@babel/parser';

class ParserService {
    public getImportedFiles(filePath: string): string[] {
        const code = fs.readFileSync(filePath, 'utf-8');
        const ast = parser.parse(code, { sourceType: 'module', plugins: ['typescript'] });
        const importedFiles: string[] = [];
        const traverseFn = (traverse as any).default || traverse;

        traverseFn(ast, {
            ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
                if (path.node.importKind !== 'type') {
                    let hasNonTypeImport = false;

                    for (const specifier of path.node.specifiers) {
                        if (t.isImportSpecifier(specifier) && specifier.importKind !== 'type') {
                            hasNonTypeImport = true;
                            break;
                        }
                    }

                    if (hasNonTypeImport || path.node.specifiers.length === 0) {
                        const importPath = path.node.source.value;
                        importedFiles.push(importPath);
                    }
                }
            }
        });

        return importedFiles;
    }

    public callsAreUsedCorrectly(filePath: string, type = 'sync', modelNames: string[]): boolean {
        let areAwaited = true;
        let usedCorrectly = true;
        let noReturnUsed = true;
        let retryOnUsedCorrectly = true;

        const code = fs.readFileSync(filePath, 'utf-8');
        const ast = parser.parse(code, { sourceType: 'module', plugins: ['typescript'] });
        const traverseFn = (traverse as any).default || traverse;

        const awaitMessage = (call: string, lineNumber: number) =>
            console.log(chalk.red(`nango.${call}() calls must be awaited in "${filePath}:${lineNumber}". Not awaiting can lead to unexpected results.`));

        const disallowedMessage = (call: string, lineNumber: number) =>
            console.log(chalk.red(`nango.${call}() calls are not allowed in an action script. Please remove it at "${filePath}:${lineNumber}".`));

        const nangoCalls = [
            'batchSend',
            'batchSave',
            'batchDelete',
            'log',
            'getFieldMapping',
            'setFieldMapping',
            'getMetadata',
            'setMetadata',
            'proxy',
            'get',
            'post',
            'put',
            'patch',
            'delete',
            'getConnection',
            'getEnvironmentVariables',
            'triggerAction'
        ];

        const disallowedActionCalls = ['batchSend', 'batchSave', 'batchDelete', 'batchUpdate'];

        const deprecatedCalls: Record<string, string> = {
            batchSend: 'batchSave',
            getFieldMapping: 'getMetadata',
            setFieldMapping: 'setMetadata'
        };

        const callsProxy = ['proxy', 'get', 'post', 'put', 'patch', 'delete'];
        const callsBatchingRecords = ['batchSave', 'batchDelete', 'batchUpdate'];
        const callsReferencingModelsToCheck = callsBatchingRecords.concat('setMergingStrategy');
        const proxyLines: number[] = [];
        const batchingRecordsLines: number[] = [];
        const setMergingStrategyLines: number[] = [];

        traverseFn(ast, {
            CallExpression(path: NodePath<t.CallExpression>) {
                const lineNumber = path.node.loc?.start.line as number;
                const callee = path.node.callee as t.MemberExpression;
                if (callee.object?.type === 'Identifier' && callee.object.name === 'nango' && callee.property?.type === 'Identifier') {
                    if (deprecatedCalls[callee.property.name]) {
                        console.warn(
                            chalk.yellow(
                                `nango.${callee.property.name}() used at line ${lineNumber} is deprecated. Use nango.${
                                    deprecatedCalls[callee.property.name]
                                }() instead.`
                            )
                        );
                    }
                    if (type === 'action') {
                        if (disallowedActionCalls.includes(callee.property.name)) {
                            disallowedMessage(callee.property.name, lineNumber);
                            usedCorrectly = false;
                        }
                    }

                    const isAwaited = path.findParent((parentPath) => parentPath.isAwaitExpression());
                    const isThenOrCatch = path.findParent(
                        (parentPath) =>
                            t.isMemberExpression(parentPath.node) &&
                            (t.isIdentifier(parentPath.node.property, { name: 'then' }) || t.isIdentifier(parentPath.node.property, { name: 'catch' }))
                    );

                    const isReturned = Boolean(path.findParent((parentPath) => t.isReturnStatement(parentPath.node)));

                    if (!isAwaited && !isThenOrCatch && !isReturned && nangoCalls.includes(callee.property.name)) {
                        awaitMessage(callee.property.name, lineNumber);
                        areAwaited = false;
                    }

                    if (callsReferencingModelsToCheck.includes(callee.property.name)) {
                        const args = path.node.arguments as t.Expression[];
                        if (args.length > 1) {
                            const modelArg = args[args.length - 1];
                            if (t.isStringLiteral(modelArg) && !modelNames.includes(modelArg.value)) {
                                console.log(
                                    chalk.red(
                                        `"${
                                            modelArg.value
                                        }" is not a valid model name. Please check "${filePath}:${lineNumber}". The possible model names are: ${modelNames.join(
                                            ', '
                                        )}`
                                    )
                                );
                                usedCorrectly = false;
                            }
                        }
                    }

                    const callArguments = path.node.arguments;
                    if (callArguments.length > 0 && t.isObjectExpression(callArguments[0])) {
                        let retriesPropertyFound = false;
                        let retryOnPropertyFound = false;
                        callArguments[0].properties.forEach((prop: t.ObjectProperty | t.ObjectMethod | t.SpreadElement) => {
                            if (t.isObjectProperty(prop)) {
                                if (t.isIdentifier(prop.key) && prop.key.name === 'retries') {
                                    retriesPropertyFound = true;
                                }
                                if (t.isIdentifier(prop.key) && prop.key.name === 'retryOn') {
                                    retryOnPropertyFound = true;
                                }
                            }
                        });

                        if (!retriesPropertyFound && retryOnPropertyFound) {
                            const lineNumber = path.node.loc?.start.line as number;
                            console.log(
                                chalk.red(
                                    `Usage of 'retryOn' without 'retries' at "${filePath}:${lineNumber}". 'retryOn' should not be used if 'retries' is not set.`
                                )
                            );
                            retryOnUsedCorrectly = false;
                        }
                    }

                    if (callsProxy.includes(callee.property.name)) {
                        proxyLines.push(lineNumber);
                    }
                    if (callsBatchingRecords.includes(callee.property.name)) {
                        batchingRecordsLines.push(lineNumber);
                    }
                    if (callee.property.name === 'setMergingStrategy') {
                        setMergingStrategyLines.push(lineNumber);
                    }
                }
            },
            ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
                const declaration = path.node.declaration;
                function functionReturnsValue(funcNode: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression): boolean {
                    let returnsValue = false;

                    traverseFn(funcNode.body, {
                        ReturnStatement(path: NodePath<t.ReturnStatement>) {
                            if (path.node.argument !== null) {
                                returnsValue = true;
                                path.stop();
                            }
                        },
                        FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
                            path.skip();
                        },
                        FunctionExpression(path: NodePath<t.FunctionExpression>) {
                            path.skip();
                        },
                        ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
                            path.skip();
                        },
                        noScope: true
                    });

                    return returnsValue;
                }

                if (t.isFunctionDeclaration(declaration) || t.isFunctionExpression(declaration) || t.isArrowFunctionExpression(declaration)) {
                    if (functionReturnsValue(declaration) && type === 'sync') {
                        const lineNumber = declaration.loc?.start.line || 'unknown';
                        console.log(
                            chalk.red(
                                `The default exported function fetchData at "${filePath}:${lineNumber}" must not return a value. Sync scripts should not return but rather use batchSave to save data.`
                            )
                        );
                        noReturnUsed = false;
                    }
                }
            }
        });

        if (
            batchingRecordsLines.length > 0 &&
            setMergingStrategyLines.length > 0 &&
            setMergingStrategyLines.some((line) => line > Math.min(...batchingRecordsLines))
        ) {
            console.log(
                chalk.red(`setMergingStrategy should be called before any batching records function in "${filePath}:${Math.min(...setMergingStrategyLines)}".`)
            );
            usedCorrectly = false;
        }
        if (proxyLines.length > 0 && setMergingStrategyLines.length > 0 && setMergingStrategyLines.some((line) => line > Math.min(...proxyLines))) {
            console.log(chalk.red(`setMergingStrategy should be called before any proxy function in "${filePath}:${Math.min(...setMergingStrategyLines)}".`));
            usedCorrectly = false;
        }

        return areAwaited && usedCorrectly && noReturnUsed && retryOnUsedCorrectly;
    }
}

const parserService = new ParserService();
export default parserService;
