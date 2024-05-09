import { BigQuery } from '@google-cloud/bigquery';
import type { BigQuery as BigQueryType } from '@google-cloud/bigquery';
import { getLogger, isCloud } from '@nangohq/utils';

const logger = getLogger('BigQueryClient');

interface RunScriptRow {
    executionType: string;
    internalConnectionId: number | undefined;
    connectionId: string;
    accountId: number | undefined;
    accountName: string;
    scriptName: string;
    scriptType: string;
    environmentId: number;
    environmentName: string;
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
                        { name: 'accountName', type: 'STRING' },
                        { name: 'scriptName', type: 'STRING' },
                        { name: 'scriptType', type: 'STRING' },
                        { name: 'environmentId', type: 'INTEGER' },
                        { name: 'environmentName', type: 'STRING' },
                        { name: 'providerConfigKey', type: 'STRING' },
                        { name: 'status', type: 'STRING' },
                        { name: 'syncId', type: 'STRING' },
                        { name: 'content', type: 'STRING' },
                        { name: 'runTimeInSeconds', type: 'FLOAT' },
                        { name: 'createdAt', type: 'INTEGER' }
                    ]
                }
            });
        }
    }

    public async insert(data: RunScriptRow, tableName?: string) {
        const table = tableName || this.tableName;
        try {
            if (isCloud) {
                await this.client.dataset(this.datasetName).table(table).insert(data);
            }
        } catch (e) {
            logger.error('Error inserting into BigQuery', e);
        }
    }
}

export { BigQueryClient, BigQueryType };
