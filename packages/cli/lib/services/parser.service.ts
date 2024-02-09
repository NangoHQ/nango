import fs from 'fs';
import chalk from 'chalk';
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import parser from '@babel/parser';
import { SyncConfigType } from '@nangohq/shared';

class ParserService {
    public callsAreUsedCorrectly(filePath: string, type = SyncConfigType.SYNC, modelNames: string[]): boolean {
        const code = fs.readFileSync(filePath, 'utf-8');
        let areAwaited = true;
        let usedCorrectly = true;

        const ast = parser.parse(code, { sourceType: 'module', plugins: ['typescript'] });

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
            'get',
            'post',
            'put',
            'patch',
            'delete',
            'getConnection',
            'setLastSyncDate',
            'getEnvironmentVariables',
            'triggerAction'
        ];

        const disallowedActionCalls = ['batchSend', 'batchSave', 'batchDelete', 'setLastSyncDate'];

        const deprecatedCalls: Record<string, string> = {
            batchSend: 'batchSave',
            getFieldMapping: 'getMetadata',
            setFieldMapping: 'setMetadata'
        };

        const callsReferencingModelsToCheck = ['batchSave', 'batchDelete'];
        const traverseFn = (traverse as any).default || traverse;

        traverseFn(ast, {
            CallExpression(path: NodePath<t.CallExpression>) {
                const lineNumber = path.node.loc?.start.line as number;
                const callee = path.node.callee as t.MemberExpression;
                if (callee.object?.type === 'Identifier' && callee.object.name === 'nango' && callee.property?.type === 'Identifier') {
                    if (deprecatedCalls[callee.property.name as string]) {
                        console.warn(
                            chalk.yellow(
                                `nango.${callee.property.name}() used at line ${lineNumber} is deprecated. Use nango.${
                                    deprecatedCalls[callee.property.name]
                                }() instead.`
                            )
                        );
                    }
                    if (type === SyncConfigType.ACTION) {
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

                    if (!isAwaited && !isThenOrCatch && nangoCalls.includes(callee.property.name)) {
                        awaitMessage(callee.property.name, lineNumber);
                        areAwaited = false;
                    }

                    if (callsReferencingModelsToCheck.includes(callee.property.name)) {
                        const args = path.node.arguments as t.Expression[];
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
            }
        });

        return areAwaited && usedCorrectly;
    }
}

const parserService = new ParserService();
export default parserService;
