import { BigQuery } from '@google-cloud/bigquery';
import type { BigQuery as BigQueryType } from '@google-cloud/bigquery';
import { getLogger } from '@nangohq/utils/dist/logger.js';
import { env, isCloud, isLocal } from '@nangohq/utils/dist/environment/detection.js';

const logger = getLogger('BigQueryClient');

interface RunScriptRow {
    executionType: string;
    internalConnectionId: number | undefined;
    connectionId: string;
    accountId: number | undefined;
    scriptName: string;
    scriptType: string;
    environmentId: number;
    providerConfigKey: string;
    status: string;
    syncId: string;
    content: string;
    runTimeInSeconds: number;
    createdAt: number;
}

class BigQueryClient {
    private client: BigQuery;
    private datasetName: string;
    private tableName: string;

    constructor({ datasetName, tableName }: { datasetName: string; tableName: string }) {
        this.client = new BigQuery();
        this.tableName = tableName;
        this.datasetName = datasetName;
    }

    static async createInstance({ datasetName, tableName }: { datasetName?: string; tableName: string }) {
        const instance = new BigQueryClient({
            datasetName: datasetName || 'raw',
            tableName
        });
        await instance.initialize();
        return instance;
    }

    private async initialize() {
        try {
            if (isCloud) {
                await this.createDataSet();
                await this.createTable();
            }
        } catch (e) {
            logger.error('Error initializing', e);
        }
    }

    private async createDataSet() {
        const dataset = this.client.dataset(this.datasetName);
        const [exists] = await dataset.exists();
        if (!exists) {
            await this.client.createDataset(this.datasetName);
        }
    }

    private async createTable() {
        const table = this.client.dataset(this.datasetName).table(this.tableName);
        const [exists] = await table.exists();
        if (!exists) {
            await table.create({
                schema: {
                    fields: [
                        { name: 'executionType', type: 'STRING' },
                        { name: 'internalConnectionId', type: 'INTEGER' },
                        { name: 'connectionId', type: 'STRING' },
                        { name: 'accountId', type: 'INTEGER' },
                        { name: 'scriptName', type: 'STRING' },
                        { name: 'scriptType', type: 'STRING' },
                        { name: 'environmentId', type: 'INTEGER' },
                        { name: 'providerConfigKey', type: 'STRING' },
                        { name: 'status', type: 'STRING' },
                        { name: 'syncId', type: 'STRING' },
                        { name: 'content', type: 'STRING' },
                        { name: 'runTimeInSeconds', type: 'INTEGER' }, // in seconds
                        { name: 'createdAt', type: 'INTEGER' }
                    ]
                }
            });
        }
    }

    public async insert(data: RunScriptRow, tableName?: string) {
        const table = tableName || `${env}_${this.tableName}`;
        try {
            if (isCloud) {
                await this.client.dataset(this.datasetName).table(table).insert(data);
            }
            if (isLocal) {
                logger.info(`Data would be inserted into BigQuery type ${JSON.stringify(data, null, 2)}`);
            }
        } catch (e) {
            logger.error('Error inserting into BigQuery', e);
        }
    }
}

export { BigQueryClient, BigQueryType };
