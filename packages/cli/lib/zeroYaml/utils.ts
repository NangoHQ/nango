import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import ts from 'typescript';

import { exampleFolder } from './constants.js';

export async function syncTsConfig({ fullPath }: { fullPath: string }) {
    await fs.promises.writeFile(path.join(fullPath, 'tsconfig.json'), await fs.promises.readFile(path.join(exampleFolder, 'tsconfig.json')));
}

export function fileErrorToText({ filePath, msg, line, character }: { filePath: string; msg: string; line?: number | undefined; character?: number }) {
    return `${chalk.red('err')} - ${chalk.blue(filePath)}${line ? chalk.yellow(`:${line + 1}${character ? `:${character + 1}` : ''}`) : ''} \r\n  ${msg}\r\n`;
}

export function tsDiagnosticToText(fullPath: string) {
    return (diagnostic: ts.Diagnostic) => {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        if (diagnostic.file && diagnostic.start !== null) {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
            const fileName = diagnostic.file.fileName.replace(`${fullPath}/`, '');
            console.log(fileErrorToText({ filePath: fileName, msg: message, line, character }));
        } else {
            console.error(message);
        }
    };
}

export type CompileErrorType =
    | 'nango_unsupported_export'
    | 'nango_invalid_function_param'
    | 'nango_invalid_default_export'
    | 'nango_invalid_export_constant'
    | 'failed_to_build_unknown'
    | 'method_need_await'
    | 'retryon_need_retries'
    | 'disallowed_import';

export const badExportCompilerError = 'Invalid default export: should be createAction(), createSync() or createOnEvent()';

export abstract class ReadableError extends Error {
    abstract toText(): string;
}

export class DefinitionError extends ReadableError {
    filePath;
    property;

    constructor(msg: string, filePath: string, property: string[]) {
        super(msg);
        this.filePath = filePath;
        this.property = property;
    }

    toText() {
        return fileErrorToText({
            filePath: this.filePath,
            msg: `${chalk.grey(this.property.join(' > '))} ${this.message}`
        });
    }
}

export class CompileError extends ReadableError {
    type;
    customMessage;
    lineNumber;
    filePath;

    constructor(type: CompileErrorType, lineNumber: number, message: string, filePath?: string) {
        super(type);
        this.type = type;
        this.lineNumber = lineNumber;
        this.customMessage = message ?? 'Unknown error';
        this.filePath = filePath;
    }

    toText() {
        return fileErrorToText({
            filePath: this.filePath!,
            msg: this.customMessage,
            // Incompatible with ts lineNumber
            line: this.lineNumber > 0 ? this.lineNumber - 1 : 0
        });
    }
}

export class InvalidModelDefinitionError extends DefinitionError {
    constructor(modelName: string, filePath: string, property: string[]) {
        super(
            `Model "${modelName}" contains invalid characters. It should start with an uppercase and only contains alphanumeric characters`,
            filePath,
            property
        );
    }
}

export class DuplicateEndpointDefinitionError extends DefinitionError {
    constructor(key: string, filePath: string, property: string[]) {
        super(`Endpoint "${key}" is used multiple times. Please make sure all endpoints are unique per integration.`, filePath, property);
    }
}

export class EndpointMismatchDefinitionError extends DefinitionError {
    constructor(filePath: string, property: string[]) {
        super(`The number of endpoints doesn't match the number of models. You need as many endpoints as models`, filePath, property);
    }
}

export class InvalidIntervalDefinitionError extends DefinitionError {
    constructor(filePath: string, property: string[]) {
        super('Interval is invalid, check syntax here https://github.com/vercel/ms', filePath, property);
    }
}

export class DuplicateModelDefinitionError extends DefinitionError {
    constructor(modelName: string, filePath: string, property: string[]) {
        super(`Model "${modelName}" is defined multiple times. Please make sure all models are unique per integration.`, filePath, property);
    }
}

export class TrackDeletesDefinitionError extends DefinitionError {
    constructor(filePath: string, property: string[]) {
        super(`Track deletes is not supported for incremental syncs`, filePath, property);
    }
}
