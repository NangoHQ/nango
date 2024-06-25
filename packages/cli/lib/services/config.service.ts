import fs from 'fs';
import Ajv from 'ajv';
import addErrors from 'ajv-errors';
import chalk from 'chalk';

import { getNangoRootPath, printDebug } from '../utils.js';
import type { ServiceResponse } from '@nangohq/shared';
import { NangoError } from '@nangohq/shared';
import type { NangoYamlParser } from '@nangohq/nango-yaml';
import { determineVersion, loadNangoYaml } from '@nangohq/nango-yaml';

export interface ValidationMessage {
    msg: string;
    path?: string;
    code?: string | undefined;
    params?: Record<string, any> | undefined;
}

export function parse(fullPath: string, debug = false): ServiceResponse<NangoYamlParser> {
    if (debug) {
        printDebug(`Loading ${fullPath}`);
    }

    try {
        const parser = loadNangoYaml({ fullPath });
        if (debug) {
            printDebug(`Config file found`);
        }

        const valid = validateAndOutput(parser.raw);
        if (!valid) {
            return { success: false, error: new NangoError('failed_to_parse_nango_yaml'), response: null };
        }

        parser.parse();
        if (parser.errors.length > 0) {
            for (const error of parser.errors) {
                console.log(chalk.underline(chalk.white(error.path)));
                console.log(`  ${chalk.red('error')} ${error.message}${error.code ? chalk.dim(` [${error.code}]`) : ''}`);
                console.log('');
            }
            return { success: false, error: new NangoError('failed_to_parse_nango_yaml'), response: null };
        }
        if (parser.warnings.length > 0) {
            parser.warnings.forEach((warn) => {
                console.log(chalk.underline(chalk.white(warn.path)));
                console.log(`${chalk.yellow(warn.message)} [${warn.code}]`);
                console.log('');
            });
        }

        return { success: true, error: null, response: parser };
    } catch {
        return { success: false, error: new NangoError('error_loading_nango_config'), response: null };
    }
}

/**
 * Output validation errors to console
 */
export function validateAndOutput(yaml: any): boolean {
    const errors = validateYaml(yaml);
    if (errors.length <= 0) {
        return true;
    }

    const messages = [];
    for (const error of errors) {
        if (error.path) {
            messages.push(chalk.underline(chalk.white(error.path.substring(1).split('/').join(' > '))));
        }
        messages.push(`  ${chalk.red('error')} ${error.msg}${error.code ? chalk.dim(` [${error.code}]`) : ''}`);

        if (error.params) {
            for (const [key, val] of Object.entries(error.params)) {
                messages.push(chalk.dim(`  ${key}: ${val}`));
            }
        }
        messages.push('');
    }

    console.log(`${chalk.red(`nango.yaml validation failed`)}\n\n${messages.join('\n')}`);
    return false;
}

/**
 * Use AJV to validate a nango.yaml against json schema
 */
export function validateYaml(yaml: any): ValidationMessage[] {
    const ajv = new Ajv({ allErrors: true });
    addErrors(ajv);

    if (!yaml || !('integrations' in yaml)) {
        return [
            {
                msg: 'Invalid file format, you should have at least an `integrations` property at the root level. Check our documentation https://docs.nango.dev/reference/integration-configuration'
            }
        ];
    }
    const version = determineVersion(yaml);
    const validationFile = version === 'v1' ? 'nango.yaml.schema.v1.json' : 'nango.yaml.schema.v2.json';

    const schema = fs.readFileSync(`${getNangoRootPath()}/lib/${validationFile}`, 'utf8');
    const validate = ajv.compile(JSON.parse(schema));

    if (validate(yaml)) {
        return [];
    }

    const messages: ValidationMessage[] = [];
    for (const error of validate.errors!) {
        if (!error.message || error.message === ' ') {
            continue;
        }
        const code = error.keyword !== 'errorMessage' ? error.keyword : undefined;
        messages.push({
            msg: error.message,
            path: error.instancePath,
            code,
            params: error.params && Object.keys(error.params).length > 0 && !('errors' in error.params) ? error.params : undefined
        });
    }

    return messages;
}
