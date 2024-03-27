import { BigQuery } from '@google-cloud/bigquery';
import logger from '../logger/console.js';
import { isCloud, getEnv } from '../utils/utils.js';

type Row = Record<string, string | number | undefined>;

class BigQueryClient {
    private client: BigQuery;
    private datasetName: string;
    private tableName: string;

    constructor() {
        this.client = new BigQuery();
        this.datasetName = 'dataset';
        this.tableName = 'script_runs';
    }

    private async createDataSet() {
        const dataset = this.client.dataset(this.datasetName);
        const [exists] = await dataset.exists();
        if (!exists) {
            await this.client.createDataset(this.datasetName);
        }
    }

    private async createTable() {
        const table = this.client.dataset(this.datasetName).table(`${getEnv()}_${this.tableName}`);
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
                        { name: 'runTime', type: 'INTEGER' },
                        { name: 'timestamp', type: 'INTEGER' }
                    ]
                }
            });
        }
    }

    private async initializeTable() {
        await this.createDataSet();
        await this.createTable();
    }

    public async insert(data: Row) {
        try {
            if (isCloud()) {
                await this.initializeTable();
                await this.client.dataset(this.datasetName).table(`${getEnv()}_${this.tableName}`).insert(data);
            }
        } catch (e) {
            logger.error('Error inserting into BigQuery', e);
        }
    }
}

export default new BigQueryClient();
