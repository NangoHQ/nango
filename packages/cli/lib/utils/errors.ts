import type { ErrorObject } from 'ajv';
import chalk from 'chalk';
import { inspect } from 'util';

export function displayValidationError({ data, validation, model }: { data: any; validation: (Error | ErrorObject)[]; model?: string }) {
    if (model) {
        console.log(chalk.blue('model:'), model);
    }
    console.log(chalk.blue('data:'), inspect(data, false, 5, true));
    console.log('');
    for (const error of validation) {
        if (error instanceof Error) {
            console.log('-', error.message);
            continue;
        }

        const paths = error.instancePath.split('/');
        paths.shift();
        const schema = error.schemaPath.split('/');
        schema.shift();
        if (schema.length > 0) {
            if (schema[0] === 'definitions') {
                schema.shift();
            } else if (model) {
                schema.unshift(model);
            }
        }

        console.log(chalk.underline(chalk.white(paths.length > 0 ? paths.join(' > ') : 'root')));
        console.log('  ', chalk.red('error'), ' ', error.message, error.keyword ? chalk.dim(` [${error.keyword}]`) : '');
        console.log('  ', chalk.gray(schema.join(' > ')));
        console.log('');
    }
}

export class CLIError extends Error {
    code;
    constructor(code: 'failed_to_parse_nango_yaml' | 'error_loading_nango_yaml', message?: string) {
        super(message || code);

        this.code = code;
    }
}
