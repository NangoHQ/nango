import { BigQuery } from '@google-cloud/bigquery';
import type { BigQuery as BigQueryType } from '@google-cloud/bigquery';
import { getLogger, flagHasBigQuery } from '@nangohq/utils';

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
    internalIntegrationId: number | null;
    endUser: { id: number; endUserId: string | null; orgId: string | null } | null;
}

const fields = [
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
    { name: 'createdAt', type: 'INTEGER' },
    { name: 'internalIntegrationId', type: 'INTEGER' },
    { name: 'endUserId', type: 'INTEGER' },
    { name: 'endUserUserId', type: 'STRING' },
    { name: 'endUserOrgId', type: 'STRING' }
] as const;

interface TypeMap {
    STRING: string;
    INTEGER: number;
    FLOAT: number;
}

type RecordType<T extends readonly { name: string; type: keyof TypeMap }[]> = {
    [K in T[number] as K['name']]: K['type'] extends keyof TypeMap ? TypeMap[K['type']] | null | undefined : never;
};

// Use the utility type to infer the result
type Schema = RecordType<typeof fields>;

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
        if (!flagHasBigQuery) {
            return;
        }

        try {
            await this.createDataSet();
            await this.createTable();
        } catch (err) {
            logger.error('Error initializing', err);
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
                schema: { fields }
            });
        } else {
            // If the table exists, retrieve the current schema
            const [metadata] = await table.getMetadata();
            const existingFields = metadata.schema.fields as { name: string }[];

            // Add new fields that don't already exist in the schema
            const existingFieldNames = existingFields.map((field) => field.name);
            const newFields = fields.filter((field) => !existingFieldNames.includes(field.name));

            if (newFields.length > 0) {
                // Update the schema with the new fields
                const updatedFields = [...existingFields, ...newFields];
                await table.setMetadata({
                    schema: { fields: updatedFields }
                });
                logger.info('Schema updated successfully with new fields:', newFields);
            }
        }
    }

    public async insert(data: RunScriptRow, tableName?: string) {
        if (!flagHasBigQuery) {
            return;
        }

        const table = tableName || this.tableName;
        try {
            const insertData: Schema = {
                executionType: data.executionType,
                internalConnectionId: data.internalConnectionId,
                connectionId: data.connectionId,
                accountId: data.accountId,
                accountName: data.accountName,
                scriptName: data.scriptName,
                scriptType: data.scriptType,
                environmentId: data.environmentId,
                environmentName: data.environmentName,
                providerConfigKey: data.providerConfigKey,
                status: data.status,
                syncId: data.syncId,
                content: data.content,
                runTimeInSeconds: data.runTimeInSeconds,
                createdAt: data.createdAt,
                internalIntegrationId: data.internalIntegrationId,
                endUserId: data.endUser?.id,
                endUserOrgId: data.endUser?.orgId,
                endUserUserId: data.endUser?.endUserId
            };
            await this.client.dataset(this.datasetName).table(table).insert(insertData);
        } catch (err) {
            logger.error('Error inserting into BigQuery', err);
        }
    }
}

export { BigQueryClient, BigQueryType };
