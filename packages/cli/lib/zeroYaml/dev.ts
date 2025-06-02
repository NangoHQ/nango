import fs from 'node:fs';
import path from 'node:path';
import { nextTick } from 'node:process';
import { setTimeout } from 'node:timers/promises';

import chalk from 'chalk';
import chokidar from 'chokidar';
import ora from 'ora';
import ts from 'typescript';

import { printDebug } from '../utils.js';
import { compileOne, getEntryPoints, tsToJsPath, tsconfig } from './compile.js';

import type { Ora } from 'ora';

export function dev({ fullPath, debug }: { fullPath: string; debug: boolean }) {
    const outDir = path.join(fullPath, 'build');

    if (!fs.existsSync(outDir)) {
        printDebug(`Creating ${outDir} directory`, debug);
        fs.mkdirSync(outDir);
    }

    typescriptWatch({ fullPath, debug });
}

function manualWatch({ fullPath, debug }: { fullPath: string; debug: boolean }) {
    const watchPath = ['./**/*.ts'];
    printDebug(`Watching ${watchPath.join(', ')}`, debug);

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
            const fp = path.join(fullPath, filePath);
            if (filePath === indexTs) {
                // When the user modify index.ts
                // Keep track of what we need to build or not
                // We rely on index.ts being the first file to be parsed
                const indexContent = fs.readFileSync(fp).toString();
                const tmp = getEntryPoints(indexContent).map((e) => e.replace('.js', '.ts').substring(2));

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

            // Not a know file
            if (!entryPoints.includes(filePath)) {
                printDebug(`File ${filePath} modified but not imported in index.ts`, debug);
                return;
            }

            spinner = ora({ text: `Compiling ${filePath}` }).start();

            const res = await compileOne({ entryPoint: path.join(fullPath, filePath).replace('.ts', '.js'), projectRootPath: fullPath });
            if (res.isErr()) {
                spinner.fail();
                bufferOrDisplayError(filePath, res.error.message);
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
        try {
            fs.unlinkSync(path.join(fullPath, 'build', tsToJsPath(filePath)));
        } catch {
            printDebug(`Failed to remove ${filePath}`, debug);
        }
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

        if (entryPoints.includes(filePath.replace('.ts', '.js'))) {
            console.warn(chalk.yellow(`You need to remove import ${filePath} from index.ts`));
        }

        onDelete(filePath.replace('.ts', '.js'));
    });
}

/**
 * Use typescript watch program to:
 * - Typescript all files inside the folder
 * - Register change and bundle files
 */
function typescriptWatch({ fullPath, debug }: { fullPath: string; debug: boolean }) {
    let entryPoints: string[] = [];
    let hasError = false;
    let indexTsChanged = false;

    function updateEntryPoints() {
        const sourceFile = prm.getProgram().getSourceFile('index.ts') as ts.SourceFile & { imports: any[] };
        entryPoints = sourceFile.imports.map((i) => i.text.substring(2).replace('.js', '.ts')) as string[];
    }

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
        reportWatchStatusChanged,
        { excludeDirectories: true }
    );
    const changedFiles = new Set<string>();

    // Patch watchFile to track changes
    const origWatchFile = host.watchFile;
    host.watchFile = (fileName, callback, ...args) => {
        return origWatchFile(
            fileName,
            (file, eventKind) => {
                console.log(fileName, eventKind);
                const relative = fileName.replace(fullPath, '').substring(1);
                if (eventKind === ts.FileWatcherEventKind.Changed || eventKind === ts.FileWatcherEventKind.Created) {
                    console.log('add or upd', relative);
                    if (entryPoints.includes(relative)) {
                        changedFiles.add(relative);
                    } else if (relative === 'index.ts') {
                        indexTsChanged = true;
                    }
                } else if (eventKind === ts.FileWatcherEventKind.Deleted) {
                    indexTsChanged = true;
                }
                callback(file, eventKind);
            },
            ...args
        );
    };

    const origAfterProgramCreate = host.afterProgramCreate;
    host.afterProgramCreate = (program) => {
        if (origAfterProgramCreate) {
            origAfterProgramCreate(program);
        }
        if (indexTsChanged) {
            console.log('index.ts changed');
            updateEntryPoints();
            for (const entryPoint of entryPoints) {
                try {
                    if (!fs.statSync(path.join(fullPath, entryPoint)).isFile()) {
                        console.error(chalk.red(`Import ${entryPoint} is not a file`));
                    }
                } catch (err) {
                    console.error(chalk.red(err instanceof Error ? err.message : 'Unknown error'));
                }
            }
            indexTsChanged = false;
        }

        if (changedFiles.size > 0) {
            if (hasError) {
                return;
            }

            void compileMultiples({ fullPath, entryPoints: Array.from(changedFiles) });
            changedFiles.clear();
        }
    };

    const prm = ts.createWatchProgram(host);
    updateEntryPoints();
    void compileMultiples({ fullPath, entryPoints });
}

async function compileMultiples({ fullPath, entryPoints }: { fullPath: string; entryPoints: string[] }) {
    const failures: string[] = [];

    for (const entryPoint of entryPoints) {
        const absolutePath = path.join(fullPath, entryPoint);

        let spinner: Ora | undefined;
        try {
            spinner = ora({ text: `Compiling ${entryPoint}` }).start();

            if (!fs.statSync(absolutePath).isFile()) {
                spinner.fail();
                failures.push(chalk.red(`Import ${entryPoint} is not a file`));
                continue;
            }

            const res = await compileOne({ entryPoint: absolutePath.replace('.ts', '.js'), projectRootPath: fullPath });
            if (res.isErr()) {
                spinner.fail();
            } else {
                spinner.succeed();
            }
        } catch (err) {
            spinner?.fail();
            failures.push(chalk.red(err instanceof Error ? err.message : 'Unknown error'));
        }
    }

    for (const fail of failures) {
        console.error(fail);
    }
}
