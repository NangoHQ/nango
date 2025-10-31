import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';
import ts from 'typescript';

import { Err, Ok } from '../utils/result.js';
import { printDebug } from '../utils.js';
import { tsconfig } from './constants.js';

import type { Result } from '@nangohq/types';
import type { PackageJson } from 'type-fest';

/**
 * Lightweight type checking for when dependency versions don't match.
 * This file contains all the special-case logic to handle version mismatches,
 * keeping the normal compile.ts flow clean.
 */

/**
 * Check if we should use lightweight type checking due to dependency version mismatches.
 * Returns true if Zod versions don't match (e.g., user has 4.1.12 but Nango expects 4.0.5).
 */
export async function shouldUseLightweightMode(fullPath: string): Promise<boolean> {
    try {
        const packageJsonPath = path.join(fullPath, 'package.json');
        const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent) as PackageJson;

        // Check Zod version mismatch
        const userZodVersion = packageJson.devDependencies?.['zod'];
        if (!userZodVersion) {
            return false; // No zod installed, safe to use normal typecheck
        }

        // Get Nango's expected zod version from CLI package.json
        const cliPackageJsonPath = path.join(dirname(fileURLToPath(import.meta.url)), '../../package.json');
        const cliPackageJsonContent = await fs.promises.readFile(cliPackageJsonPath, 'utf-8');
        const cliPackageJson = JSON.parse(cliPackageJsonContent) as PackageJson;
        const expectedZodVersion = cliPackageJson.dependencies?.['zod'];

        if (!expectedZodVersion) {
            return false;
        }

        // Parse versions - extract major.minor
        const userVersion = userZodVersion.replace(/^[\^~]/, ''); // Remove ^ or ~
        const expectedVersion = expectedZodVersion.replace(/^[\^~]/, '');

        // If versions don't match (even minor versions), use lightweight mode to prevent OOM
        // Zod 4.0 -> 4.1 has breaking type changes that cause massive memory usage
        if (userVersion !== expectedVersion) {
            const userMajorMinor = userVersion.split('.').slice(0, 2).join('.');
            const expectedMajorMinor = expectedVersion.split('.').slice(0, 2).join('.');

            if (userMajorMinor !== expectedMajorMinor) {
                return true; // Version mismatch detected
            }
        }

        return false;
    } catch {
        // If we can't read package.json, don't use lightweight mode (safer to attempt full check)
        return false;
    }
}

/**
 * Performs lightweight type checking:
 * - Syntax checking only (no semantic type resolution)
 * - AST-based Zod API validation (catches common Zod mistakes)
 *
 * This prevents OOM when dependency versions don't match.
 */
export async function runLightweightTypecheck({
    fullPath,
    entryPoints,
    debug
}: {
    fullPath: string;
    entryPoints: string[];
    debug: boolean;
}): Promise<Result<boolean>> {
    console.log(chalk.yellow('⚠️  Running lightweight type checking (syntax-only) due to dependency version mismatch.'));
    console.log(chalk.yellow('   Type errors will not be caught. Update dependencies to restore full checking.\n'));

    printDebug(`Creating TypeScript program with ${entryPoints.length} entry points`, debug);

    // Create TypeScript program
    const program = ts.createProgram({
        rootNames: entryPoints.map((file) => path.join(fullPath, file.replace('.js', '.ts'))),
        options: tsconfig
    });

    printDebug('Running syntax-only diagnostics (lightweight mode)', debug);

    // Only get syntax errors (no type checking = no OOM)
    const diagnostics = [...program.getSyntacticDiagnostics()];

    // Additional validation: Check Zod API usage without type resolution
    printDebug('Running Zod API validation (lightweight mode)', debug);
    const zodValidationErrors = await validateZodUsage(fullPath, entryPoints, debug);

    if (zodValidationErrors.length > 0) {
        console.log(chalk.yellow('\n⚠️  Zod API validation warnings (lightweight mode):'));
        zodValidationErrors.forEach((err) => {
            console.log(chalk.yellow(`   ${err}`));
        });
        console.log('');
    }

    if (debug) {
        console.log('[DEBUG lightweight] Syntactic diagnostics only:', diagnostics.length);
        console.log('[DEBUG lightweight] Zod validation warnings:', zodValidationErrors.length);
    }

    // Return success if no syntax errors
    // (Zod warnings are informational, not errors)
    if (diagnostics.length === 0) {
        return Ok(true);
    }

    // Report syntax errors
    console.log('');
    console.error(chalk.red(`Found ${diagnostics.length} syntax error${diagnostics.length > 1 ? 's' : ''}`));

    return Err(new Error('Syntax errors found in lightweight mode'));
}

/**
 * Validates Zod API usage by parsing the AST without type resolution.
 * This catches common Zod method misuse without triggering OOM from type checking.
 */
async function validateZodUsage(fullPath: string, entryPoints: string[], debug: boolean): Promise<string[]> {
    const warnings: string[] = [];

    try {
        for (const entryPoint of entryPoints) {
            const filePath = path.join(fullPath, entryPoint.replace('.js', '.ts'));
            const content = await fs.promises.readFile(filePath, 'utf-8');

            // Parse the file to AST without type checking
            const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

            // Check for common Zod API issues
            const checkNode = (node: ts.Node) => {
                // Look for z.* method calls
                if (ts.isCallExpression(node)) {
                    const expression = node.expression;

                    // Check for deprecated or invalid Zod methods
                    if (ts.isPropertyAccessExpression(expression)) {
                        const text = expression.getText(sourceFile);
                        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

                        // Check for common mistakes with Zod 4.0 vs 4.1
                        if (text.includes('z.email(')) {
                            warnings.push(`${filePath}:${line} - z.email() is not supported, use z.string().email() instead`);
                        }
                        if (text.includes('z.url(')) {
                            warnings.push(`${filePath}:${line} - z.url() is not supported, use z.string().url() instead`);
                        }
                        if (text.includes('z.undefined(')) {
                            warnings.push(`${filePath}:${line} - z.undefined() is not supported, use z.void() or z.optional() instead`);
                        }

                        // Check for Zod 4.1-specific methods that might not exist in 4.0
                        const zod41OnlyMethods = ['pipe', 'brand', 'readonly'];
                        zod41OnlyMethods.forEach((method) => {
                            if (text.match(new RegExp(`\\.${method}\\(`))) {
                                warnings.push(`${filePath}:${line} - .${method}() might not be available in Zod 4.0.x (requires 4.1+)`);
                            }
                        });

                        // Check for common typos in Zod methods
                        const commonTypos = {
                            string: ['strin', 'strng'],
                            number: ['numer', 'numbr'],
                            object: ['objct', 'objet'],
                            array: ['aray', 'arry'],
                            optional: ['optinal', 'optionel']
                        };

                        Object.entries(commonTypos).forEach(([correct, typos]) => {
                            typos.forEach((typo) => {
                                if (text.includes(`z.${typo}(`)) {
                                    warnings.push(`${filePath}:${line} - Did you mean z.${correct}()? Found z.${typo}()`);
                                }
                            });
                        });

                        // Check for transform/refine without proper chaining (common mistake)
                        if (text.match(/z\.(string|number|object|array)\(\)\.transform\(/)) {
                            const hasReturn = node.getText(sourceFile).includes('return');
                            if (!hasReturn) {
                                warnings.push(`${filePath}:${line} - .transform() callback should return a value`);
                            }
                        }
                    }
                }

                ts.forEachChild(node, checkNode);
            };

            checkNode(sourceFile);
        }
    } catch (err) {
        if (debug) {
            console.log('[DEBUG validateZodUsage] Error during validation:', err);
        }
    }

    return warnings;
}
