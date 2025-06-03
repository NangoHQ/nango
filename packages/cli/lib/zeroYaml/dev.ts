import fs from 'node:fs';
import path from 'node:path';
import { nextTick } from 'node:process';
import { setTimeout } from 'node:timers/promises';

import chalk from 'chalk';
import chokidar from 'chokidar';
import ora from 'ora';
import ts from 'typescript';

import { printDebug } from '../utils.js';
import { compileOne, tsToJsPath, tsconfig } from './compile.js';

import type { Ora } from 'ora';

export function dev({ fullPath, debug }: { fullPath: string; debug: boolean }) {
    const outDir = path.join(fullPath, 'build');

    if (!fs.existsSync(outDir)) {
        printDebug(`Creating ${outDir} directory`, debug);
        fs.mkdirSync(outDir);
    }

    manualWatch({ fullPath, debug });
    typescriptWatchSimple({ fullPath, debug });
}

/**
 * Manual watch uses chokidar to listen to files changes and bundle what's declared in index.ts
 * We are not relying on tsc because it's not always sending the appropriate events on delete or rename.
 */
function manualWatch({ fullPath, debug }: { fullPath: string; debug: boolean }) {
    const watchPath = ['./**/*.ts'];
    printDebug(`Watching ${watchPath.join(', ')}`, debug);

    const graph = new DependencyGraph({ fullPath });
    const indexTs = 'index.ts';
    const processing = new Set<string>();
    const failures = new Map<string, string>();
    let entryPoints: string[] = [];
    let isReady = false;

    const watcher = chokidar.watch(watchPath, {
        ignoreInitial: false,
        ignored: ['node_modules', '.nango', 'dist', 'build']
    });

    function bufferOrDisplayError(filePath: string, msg: string) {
        if (isReady) {
            console.error(chalk.red(msg));
        } else {
            failures.set(filePath, msg);
        }
    }

    async function onAddOrUpdate(filePath: string) {
        let spinner: Ora | undefined;

        processing.add(filePath);
        try {
            graph.updatesForFile(filePath);

            if (filePath === indexTs) {
                // When the user modify index.ts
                // Keep track of what we need to build or not
                // We rely on index.ts being the first file to be parsed
                const tmp = graph.graph.get('index.ts')!;

                const newEntries = tmp.filter((e) => !entryPoints.includes(e));
                if (newEntries.length > 0) {
                    printDebug(`New entry points detected: ${newEntries.join(', ')}`, debug);
                }
                const deletedEntries = entryPoints.filter((e) => !tmp.includes(e));
                if (deletedEntries.length > 0) {
                    printDebug(`Deleted entry points detected: ${deletedEntries.join(', ')}`, debug);
                }

                entryPoints = tmp;

                if (isReady) {
                    nextTick(() => {
                        for (const entry of newEntries) {
                            watcher.emit('add', entry);
                        }
                        for (const entry of deletedEntries) {
                            onDelete(entry.replace('.ts', '.js'));
                        }
                    });
                }

                return;
            }

            // Not a known file
            if (!entryPoints.includes(filePath)) {
                printDebug(`File ${filePath} modified but not imported in index.ts`, debug);

                // Find all dependents and re-bundle them
                const dependents = Array.from(graph.findAllDependents(filePath));
                for (const dep of dependents) {
                    if (entryPoints.includes(dep)) {
                        await onAddOrUpdate(dep);
                    }
                }
                return;
            }

            spinner = ora({ text: `Compiling ${filePath}` }).start();

            const res = await compileOne({ entryPoint: path.join(fullPath, filePath).replace('.ts', '.js'), projectRootPath: fullPath });
            if (res.isErr()) {
                spinner.fail();
                // bufferOrDisplayError(filePath, res.error.message);
            } else {
                spinner.succeed();
            }
        } catch (err) {
            spinner?.fail();
            bufferOrDisplayError(filePath, err instanceof Error ? err.message : 'Unknown error');
        } finally {
            processing.delete(filePath);
        }
    }

    function onDelete(filePath: string) {
        console.log(chalk.red('-'), `Removed ${filePath}`);
        try {
            fs.unlinkSync(path.join(fullPath, 'build', tsToJsPath(filePath)));
        } catch {
            printDebug(`Failed to remove ${filePath}`, debug);
        }

        graph.removeFile(filePath);
    }

    watcher.on('ready', () => {
        async function messageOnFinish() {
            while (true) {
                if (processing.size <= 0) {
                    break;
                }
                await setTimeout(100);
            }

            console.log('');

            if (failures.size) {
                for (const fail of failures) {
                    console.error(chalk.red(fail));
                }
            }
            isReady = true;
        }
        void messageOnFinish();
    });

    watcher.on('add', (filePath: string) => {
        printDebug(`Added ${filePath}`, debug);
        void onAddOrUpdate(filePath);
    });

    watcher.on('change', (filePath: string) => {
        printDebug(`Updated ${filePath}`, debug);
        void onAddOrUpdate(filePath);
    });

    watcher.on('unlink', (filePath) => {
        printDebug(`Removed ${filePath}`, debug);
        if (filePath === indexTs) {
            return;
        }

        const jsFilePath = filePath.replace('.ts', '.js');
        if (entryPoints.includes(jsFilePath)) {
            console.warn(chalk.yellow(`You need to remove import ${filePath} from index.ts`));
        }

        onDelete(jsFilePath);
    });
}

/**
 * Use typescript watch program to typecheck all files in parallel
 */
function typescriptWatchSimple({ fullPath, debug }: { fullPath: string; debug: boolean }) {
    let hasError = false;

    function reportDiagnostic(diagnostic: ts.Diagnostic) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        if (diagnostic.file && diagnostic.start != null) {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            const fileName = diagnostic.file.fileName.replace(`${fullPath}/`, '');
            console.error(chalk.red('err'), '-', `${chalk.blue(fileName)}${chalk.yellow(`:${line + 1}:${character + 1}`)}`, `\r\n  ${message}\r\n`);
        } else {
            console.error(message);
        }
    }

    function reportWatchStatusChanged(diagnostic: ts.Diagnostic) {
        if (typeof diagnostic.messageText !== 'string') {
            return;
        }

        const noError = diagnostic.messageText.startsWith('Found 0 errors');
        const maybeError = diagnostic.messageText.startsWith('Found');
        if (maybeError && !noError) {
            hasError = true;
            console.info(diagnostic.messageText);
        } else if (diagnostic.messageText.startsWith('Starting compilation')) {
            console.info(diagnostic.messageText);
        } else if (noError) {
            if (hasError) {
                // Only log after we had some errors
                console.info(chalk.green('✔'), 'No error');
            }
            hasError = false;
        } else {
            printDebug(diagnostic.messageText, debug);
        }
    }

    const host = ts.createWatchCompilerHost(
        path.join(fullPath, 'tsconfig.json'),
        tsconfig,
        ts.sys,
        ts.createSemanticDiagnosticsBuilderProgram,
        reportDiagnostic,
        reportWatchStatusChanged
    );

    ts.createWatchProgram(host);
}

const importRegex = /^import(\s+[^'"\n]+from)?\s+['"](?<path>.+)['"]/gm;

/**
 * Dependency graph to track imports and dependents
 * so we can re-bundle files when an imported file is updated
 */
class DependencyGraph {
    graph = new Map<string, string[]>();
    reverse = new Map<string, Set<string>>();
    fullPath: string;

    constructor({ fullPath }: { fullPath: string }) {
        this.fullPath = fullPath;
    }

    parseImports(filePath: string): string[] {
        const absPath = path.join(this.fullPath, filePath);
        if (!fs.existsSync(absPath)) {
            return [];
        }

        const content = fs.readFileSync(absPath, 'utf8');
        const imports: string[] = [];
        let match;
        while ((match = importRegex.exec(content))) {
            const imp = match.groups?.['path'];
            if (!imp || !imp.startsWith('.')) {
                continue;
            }

            let resolvedImp = imp;
            if (resolvedImp.endsWith('.js')) {
                resolvedImp = resolvedImp.replace('.js', '.ts');
            } else if (!resolvedImp.endsWith('.ts')) {
                resolvedImp += '.ts';
            }
            const resolved = path.normalize(path.join(path.dirname(filePath), resolvedImp));
            imports.push(resolved);
        }
        return imports;
    }

    /**
     * Update the graphs for a single file
     */
    updatesForFile(file: string) {
        // Remove old reverse links
        if (this.graph.has(file)) {
            for (const imp of this.graph.get(file)!) {
                this.reverse.get(imp)?.delete(file);
            }
        }

        // Parse new imports
        if (fs.existsSync(path.join(this.fullPath, file))) {
            const imports = this.parseImports(file);
            this.graph.set(file, imports);
            for (const imp of imports) {
                if (!this.reverse.get(imp)) {
                    this.reverse.set(imp, new Set());
                }
                this.reverse.get(imp)!.add(file);
            }
        } else {
            // File deleted
            this.graph.delete(file);
        }
    }

    /**
     * Remove a file from the graphs
     */
    removeFile(file: string) {
        if (this.graph.has(file)) {
            for (const imp of this.graph.get(file)!) {
                this.reverse.get(imp)?.delete(file);
            }

            this.graph.delete(file);
        }
        this.reverse.delete(file);
    }

    /**
     * Find all dependents recursively
     */
    findAllDependents(file: string, visited = new Set<string>()) {
        if (!this.reverse.has(file)) {
            return visited;
        }

        for (const dep of this.reverse.get(file)!) {
            if (!visited.has(dep)) {
                visited.add(dep);
                this.findAllDependents(dep, visited);
            }
        }
        return visited;
    }
}
