import type { NangoAction, SalesforceFieldSchema, ProxyConfiguration, ActionResponseError, ChildField, Field, SalesforceEntity } from '../../models';
import { fieldSchema, childFieldSchema } from '../../schema.zod.js';

/**
 * This action fetches the available objects for a given organization in Salesforce.
 * https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_sobject_describe.htm
 * @param nango - The NangoAction object
 * @returns SalesforceFieldSchema - The fields for the object
 */
export default async function runAction(nango: NangoAction, input: SalesforceEntity): Promise<SalesforceFieldSchema> {
    try {
        const entity = input?.name || 'Task';
        const proxyConfig: ProxyConfiguration = {
            endpoint: `/services/data/v60.0/sobjects/${entity}/describe`,
            retries: 5
        };

        const response = await nango.get(proxyConfig);

        const { data } = response;
        const { fields, childRelationships } = data;

        const fieldResults = mapFields({ fields });
        const childRelationshipsResults = mapChildRelationships({
            relationships: childRelationships
        });

        return {
            fields: fieldResults,
            childRelationships: childRelationshipsResults
        };
    } catch (error: unknown) {
        const errorResponse = error as Record<string, unknown>;
        const errorResponseConfig = errorResponse['config'] as Record<string, unknown>;
        throw new nango.ActionError<ActionResponseError>({
            message: 'Failed to fetch fields in the runAction call',
            details: {
                message: errorResponse['message'] as string,
                method: errorResponseConfig['method'] as string,
                url: errorResponseConfig['url'] as string,
                code: errorResponse['code'] as string
            }
        });
    }
}

/**
 * Maps the fields from the Salesforce API response to the Field schema
 * @param fields - The unverified data returned from the Salesforce API
 * @param nango - The NangoAction object
 * @returns The mapped fields and a boolean indicating if the mapping was successful
 */
function mapFields({ fields }: { fields: unknown[] }): Field[] {
    const validatedFields: Field[] = [];
    for (const field of fields) {
        const resultData = field as Record<string, unknown>;
        const parsedField = fieldSchema.parse({
            name: resultData['name'],
            label: resultData['label'],
            type: resultData['type'],
            referenceTo: resultData['referenceTo'],
            relationshipName: resultData['relationshipName']
        });

        validatedFields.push(parsedField);
    }

    return validatedFields;
}

/**
 * Maps the child relationships from the Salesforce API response to the ChildField schema
 * @param relationships - The unverified data returned from the Salesforce API
 * @returns The mapped child relationships and a boolean indicating if the mapping was successful
 */
function mapChildRelationships({ relationships }: { relationships: unknown[] }): ChildField[] {
    const validatedRelationships: ChildField[] = [];
    for (const relationship of relationships) {
        const resultData = relationship as Record<string, unknown>;
        const parsedChildField = childFieldSchema.parse({
            object: resultData['childSObject'],
            field: resultData['field'],
            relationshipName: resultData['relationshipName']
        });
        validatedRelationships.push(parsedChildField);
    }
    return validatedRelationships;
}
