import promptly from 'promptly';
import chalk from 'chalk';

import type { Metadata, NangoConnection } from '@nangohq/shared';
import { SyncConfigType, SyncType, syncRunService, cloudHost, stagingHost } from '@nangohq/shared';
import type { GlobalOptions } from '../types.js';
import { parseSecretKey, printDebug, hostport, getConnection } from '../utils.js';
import configService from './config.service.js';
import compileService from './compile.service.js';
import integrationService from './local-integration.service.js';

interface RunArgs extends GlobalOptions {
    sync: string;
    connectionId: string;
    lastSyncDate?: string;
    useServerLastSyncDate?: boolean;
    input?: object;
    metadata?: Metadata;
}

class DryRunService {
    public async run(options: RunArgs, environment: string, debug = false) {
        let syncName = '';
        let connectionId, suppliedLastSyncDate, actionInput, rawStubbedMetadata;

        await parseSecretKey(environment, debug);

        if (!process.env['NANGO_HOSTPORT']) {
            if (debug) {
                printDebug(`NANGO_HOSTPORT is not set. Setting the default to ${hostport}`);
            }
            process.env['NANGO_HOSTPORT'] = hostport;
        }

        if (debug) {
            printDebug(`NANGO_HOSTPORT is set to ${process.env['NANGO_HOSTPORT']}`);
        }

        if (Object.keys(options).length > 0) {
            ({ sync: syncName, connectionId, lastSyncDate: suppliedLastSyncDate, input: actionInput, metadata: rawStubbedMetadata } = options);
        }

        if (!syncName) {
            console.log(chalk.red('Sync name is required'));
            return;
        }

        if (!connectionId) {
            console.log(chalk.red('Connection id is required'));
            return;
        }

        const { success, error, response: config } = await configService.load('', debug);

        if (!success || !config) {
            console.log(chalk.red(error?.message));
            return;
        }

        const providerConfigKey = config.find((config) => [...config.syncs, ...config.actions].find((sync) => sync.name === syncName))?.providerConfigKey;

        if (!providerConfigKey) {
            console.log(chalk.red(`Provider config key not found, please check that the provider exists for this sync name: ${syncName}`));
            return;
        }

        const foundConfig = config.find((configItem) => {
            const syncsArray = configItem.syncs || [];
            const actionsArray = configItem.actions || [];

            return [...syncsArray, ...actionsArray].some((sync) => sync.name === syncName);
        });

        const syncInfo = foundConfig
            ? (foundConfig.syncs || []).find((sync) => sync.name === syncName) || (foundConfig.actions || []).find((action) => action.name === syncName)
            : null;

        if (debug) {
            printDebug(`Provider config key found to be ${providerConfigKey}`);
        }

        const nangoConnection = (await getConnection(
            providerConfigKey as string,
            connectionId as string,
            {
                'Nango-Is-Sync': true,
                'Nango-Is-Dry-Run': true
            },
            debug
        )) as unknown as NangoConnection;

        if (!nangoConnection) {
            console.log(chalk.red('Connection not found'));
            return;
        }

        if (debug) {
            printDebug(`Connection found with ${JSON.stringify(nangoConnection, null, 2)}`);
        }

        if (process.env['NANGO_HOSTPORT'] === cloudHost || process.env['NANGO_HOSTPORT'] === stagingHost) {
            process.env['NANGO_CLOUD'] = 'true';
        }

        let lastSyncDate = null;

        if (suppliedLastSyncDate) {
            if (debug) {
                printDebug(`Last sync date supplied as ${suppliedLastSyncDate}`);
            }
            lastSyncDate = new Date(suppliedLastSyncDate as string);
        }

        const result = await compileService.run(debug, syncName);

        if (!result) {
            console.log(chalk.red('The sync/action did not compile successfully. Exiting'));
            return;
        }

        let normalizedInput;
        let stubbedMetadata;
        try {
            normalizedInput = JSON.parse(actionInput as unknown as string);
        } catch (e) {
            normalizedInput = actionInput;
        }

        try {
            stubbedMetadata = JSON.parse(rawStubbedMetadata as unknown as string);
        } catch (e) {
            stubbedMetadata = rawStubbedMetadata;
        }

        const logMessages: string[] = [];

        const syncRun = new syncRunService({
            integrationService,
            writeToDb: false,
            nangoConnection,
            input: normalizedInput as object,
            isAction: syncInfo?.type === SyncConfigType.ACTION,
            syncId: 'abc',
            activityLogId: -1,
            syncJobId: -1,
            syncName,
            syncType: SyncType.INITIAL,
            loadLocation: './',
            debug,
            logMessages,
            stubbedMetadata
        });

        try {
            const secretKey = process.env['NANGO_SECRET_KEY'];
            const results = await syncRun.run(lastSyncDate, true, secretKey, process.env['NANGO_HOSTPORT']);

            if (results) {
                console.log(JSON.stringify(results, null, 2));
            }

            if (syncRun.logMessages && syncRun.logMessages.length > 0) {
                const logMessages = syncRun.logMessages as unknown[];
                let index = 0;
                const batchCount = 10;

                const displayBatch = () => {
                    for (let i = 0; i < batchCount && index < logMessages.length; i++, index++) {
                        const logs = logMessages[index];
                        console.log(chalk.yellow(JSON.stringify(logs, null, 2)));
                    }
                };

                console.log(chalk.yellow('The following log messages were generated:'));

                displayBatch();

                while (index < syncRun.logMessages.length) {
                    const remaining = syncRun.logMessages.length - index;
                    const confirmation = await promptly.confirm(
                        `There are ${remaining} logs messages remaining. Would you like to see the next 10 log messages? (y/n)`
                    );
                    if (confirmation) {
                        displayBatch();
                    } else {
                        break;
                    }
                }
            }

            process.exit(0);
        } catch (e) {
            process.exit(1);
        }
    }
}

const dryRunService = new DryRunService();
export default dryRunService;
