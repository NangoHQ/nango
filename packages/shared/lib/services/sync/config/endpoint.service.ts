import { schema, dbNamespace } from '../../../db/database.js';
import configService from '../../config.service.js';
import { SyncConfig, SyncConfigType } from '../../../models/Sync.js';
import type { NangoConnection } from '../../../models/Connection.js';
import type { HTTP_VERB } from '../../../models/Generic.js';
import { OpenApiBuilder } from 'openapi3-ts/oas31';
import type { ParameterObject } from 'openapi3-ts/dist/oas30.js';

const ENDPOINT_TABLE = dbNamespace + 'sync_endpoints';
const SYNC_CONFIG_TABLE = dbNamespace + 'sync_configs';
const CONFIG_TABLE = dbNamespace + 'configs';

interface ActionOrModel {
    action?: string;
    model?: string;
}

export async function getActionOrModelByEndpoint(nangoConnection: NangoConnection, method: HTTP_VERB, path: string): Promise<ActionOrModel> {
    const config = await configService.getProviderConfig(nangoConnection.provider_config_key, nangoConnection.environment_id);
    if (!config) {
        throw new Error('Provider config not found');
    }
    const result = await schema()
        .select(`${SYNC_CONFIG_TABLE}.sync_name`, `${ENDPOINT_TABLE}.model as model`, `${SYNC_CONFIG_TABLE}.type`)
        .from<SyncConfig>(SYNC_CONFIG_TABLE)
        .join(ENDPOINT_TABLE, `${SYNC_CONFIG_TABLE}.id`, `${ENDPOINT_TABLE}.sync_config_id`)
        .where({
            [`${SYNC_CONFIG_TABLE}.environment_id`]: nangoConnection.environment_id,
            [`${SYNC_CONFIG_TABLE}.nango_config_id`]: config.id as number,
            [`${SYNC_CONFIG_TABLE}.active`]: true,
            [`${SYNC_CONFIG_TABLE}.deleted`]: false,
            [`${ENDPOINT_TABLE}.method`]: method,
            [`${ENDPOINT_TABLE}.path`]: path
        })
        .first()
        .orderBy(`${SYNC_CONFIG_TABLE}.id`, 'desc');

    if (!result) {
        return {};
    }
    if (result['type'] == SyncConfigType.ACTION) {
        return { action: result['sync_name'] };
    } else {
        return { model: result['model'] };
    }
}

export async function getOpenApiSpec(environment_id: number): Promise<string> {
    const rows = await schema()
        .select(`${SYNC_CONFIG_TABLE}.*`, `${ENDPOINT_TABLE}.*`)
        .from<SyncConfig>(SYNC_CONFIG_TABLE)
        .join(ENDPOINT_TABLE, `${SYNC_CONFIG_TABLE}.id`, `${ENDPOINT_TABLE}.sync_config_id`)
        .join(CONFIG_TABLE, `${SYNC_CONFIG_TABLE}.nango_config_id`, `${CONFIG_TABLE}.id`)
        .where({
            [`${SYNC_CONFIG_TABLE}.environment_id`]: environment_id,
            [`${SYNC_CONFIG_TABLE}.active`]: true,
            [`${SYNC_CONFIG_TABLE}.deleted`]: false
        });

    if (!rows) {
        throw new Error(`No connection endpoint(s) for environment '${environment_id}'`);
    }

    const errorResponseSpec = {
        'application/json': {
            schema: {
                type: 'object',
                properties: {
                    error: {
                        type: 'string'
                    }
                }
            }
        }
    };

    const getFieldType = (field: any) => {
        switch (field.type) {
            case 'date':
                return { type: 'string', format: 'date-time' };
            default:
                return { type: field.type };
        }
    };
    const prefix = '/v1';
    const spec = new OpenApiBuilder()
        .addTitle('Nango integrations API')
        .addVersion('1.0.0')
        .addServer({ url: 'https://app.nango.dev' })
        .addServer({ url: 'http://localhost:3003' })
        .addSecurityScheme('BearerAuth', {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header'
        });

    const tags = new Set();

    rows.forEach((row: any) => {
        const { path, method, model: modelName, model_schema: modelSchema, metadata, type } = row;

        const queryParams: ParameterObject[] = [
            { name: 'Connection-Id', in: 'header', schema: { type: 'string' }, required: true },
            { name: 'Provider-Config-Key', in: 'header', schema: { type: 'string' }, required: true }
        ];
        if (type === SyncConfigType.SYNC) {
            queryParams.push(
                { name: 'delta', in: 'query', schema: { type: 'string', format: 'date-time' } },
                { name: 'offset', in: 'query', schema: { type: 'integer' } },
                { name: 'limit', in: 'query', schema: { type: 'integer' } },
                { name: 'sort_by', in: 'query', schema: { type: 'string' } },
                { name: 'order', in: 'query', schema: { type: 'string' } },
                { name: 'filter', in: 'query', schema: { type: 'string' } }
            );
        }

        const schemaProps = modelSchema
            .find((model: any) => model.name === modelName)
            ?.['fields'].reduce((acc: any, field: any) => {
                acc[field.name] = getFieldType(field);
                return acc;
            }, {});

        const pathRoot = path.split('/')[1] || 'default';
        tags.add(pathRoot);

        spec.addSchema(`${modelName}`, {
            type: 'object',
            properties: schemaProps
        }).addPath(`${prefix}${path}`, {
            [(method as string).toLowerCase()]: {
                description: `${metadata['description'] || ''}`,
                tags: [`${pathRoot}`],
                parameters: queryParams,
                security: [{ BearerAuth: [] }],
                responses: {
                    200: {
                        description: 'Successful request',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: {
                                        $ref: `#/components/schemas/${modelName}`
                                    }
                                }
                            }
                        }
                    },
                    400: {
                        description: 'No matching connection',
                        content: errorResponseSpec
                    },
                    401: {
                        description: 'Failed authentication',
                        content: errorResponseSpec
                    },
                    404: {
                        description: 'Route not found',
                        content: errorResponseSpec
                    }
                }
            }
        });
    });

    for (const tag of tags) {
        spec.addTag({ name: `${tag}` });
    }

    return spec.getSpecAsJson();
}
