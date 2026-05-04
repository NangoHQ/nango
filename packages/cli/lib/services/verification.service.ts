import fs from 'fs';
import path from 'path';

import chalk from 'chalk';

import { printDebug } from '../utils.js';

class VerificationService {
    public async preCheck({
        fullPath,
        debug
    }: {
        fullPath: string;
        debug: boolean;
    }): Promise<{ isNango: boolean; hasNangoYaml: boolean; folderName: string; hasIndexTs: boolean; isZeroYaml: boolean }> {
        const stat = fs.statSync(fullPath, { throwIfNoEntry: false });

        const files = stat ? await fs.promises.readdir(fullPath) : [];

        const hasNangoYaml = files.includes('nango.yaml');
        const hasNangoFolder = files.includes('.nango');
        const hasIndexTs = files.includes('index.ts');
        const isZeroYaml = !hasNangoYaml && hasNangoFolder && hasIndexTs;

        if (isZeroYaml || hasNangoYaml) {
            printDebug(isZeroYaml ? 'Mode: zero yaml' : 'Model: classic yaml', debug);
        }
        return {
            isNango: hasNangoFolder || hasNangoYaml,
            folderName: path.basename(fullPath),
            hasNangoYaml,
            hasIndexTs,
            isZeroYaml
        };
    }

    public async ensureZeroYaml({ fullPath, debug }: { fullPath: string; debug: boolean }) {
        const precheck = await this.preCheck({ fullPath, debug });
        if (!precheck.isNango) {
            console.error(chalk.red(`Not inside a Nango folder`));
            process.exitCode = 1;
            return false;
        }
        if (!precheck.isZeroYaml) {
            console.error(
                chalk.red(
                    'The `nango.yaml` configuration file is deprecated. See the migration guide to Zero YAML: https://nango.dev/docs/guides/platform/migrations/migrate-to-zero-yaml'
                )
            );
            process.exitCode = 1;
            return false;
        }
        return true;
    }

    public async ensureNangoYaml({ fullPath, debug }: { fullPath: string; debug: boolean }) {
        const precheck = await this.preCheck({ fullPath, debug });
        if (!precheck.isNango) {
            console.log(chalk.red(`Not inside a Nango folder`));
            process.exitCode = 1;
            return false;
        }
        if (precheck.isZeroYaml) {
            console.log(chalk.red(`This command only works with a nango.yaml`));
            process.exitCode = 1;
            return false;
        }

        return true;
    }
}

const verificationService = new VerificationService();
export default verificationService;
