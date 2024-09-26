import type {
    NangoAction,
    SalesforceFieldSchema,
    ProxyConfiguration,
    ActionResponseError,
    ChildField,
    Field,
    SalesforceEntity,
    ValidationRule
} from '../../models';
import { fieldSchema, childFieldSchema, validationRuleSchema } from '../schema.zod.js';
import type { DescribeSObjectResult, SalesForceField, ChildRelationship, ValidationRecord, ValidationRuleResponse } from '../types';

/**
 * This action retrieves the available properties of a custom object, including fields, child relationships, and validation rules, for a given organization in Salesforce.
 * https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_sobject_describe.htm
 * https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_validationrule.htm
 *
 * @param nango - The NangoAction instance used for making API requests.
 * @param input - SalesforceEntity defining the object to describe
 * @returns A promise that resolves to a SalesforceFieldSchema object containing: fields, child relationships, and validation rules for the object
 */
export default async function runAction(nango: NangoAction, input: SalesforceEntity): Promise<SalesforceFieldSchema> {
    try {
        const entity = input?.name || 'Task';

        const proxyConfigFields: ProxyConfiguration = {
            endpoint: `/services/data/v60.0/sobjects/${entity}/describe`,
            retries: 10
        };

        const proxyConfigValidationIds: ProxyConfiguration = {
            endpoint: `/services/data/v60.0/tooling/query`,
            retries: 10,
            params: {
                q: `SELECT Id, ValidationName FROM ValidationRule WHERE EntityDefinition.QualifiedApiName='${entity}'`
            }
        };

        // Parallelize both requests as we won't get rate limited in here.
        const [fieldsResponse, validationResponse] = await Promise.all([
            nango.get<DescribeSObjectResult>(proxyConfigFields),
            nango.get<ValidationRuleResponse>(proxyConfigValidationIds)
        ]);

        const { fields, childRelationships } = fieldsResponse.data;
        const validationRulesIds = validationResponse.data.records;

        const validationRulesData: ValidationRecord[] = await fetchValidationRuleMetadata(nango, validationRulesIds);

        const fieldResults = mapFields(fields);
        const childRelationshipsResults = mapChildRelationships(childRelationships);
        const validationRulesResults = mapValidationRules(validationRulesData);

        return {
            fields: fieldResults,
            childRelationships: childRelationshipsResults,
            validationRules: validationRulesResults
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
 * Fetches metadata for multiple validation rules from the Salesforce Tooling API.
 * Note: The maximum number of active validation rules per object is limited to 500,
 * and this limit can vary based on the Salesforce edition.
 * For more details, refer to the Salesforce documentation:
 * https://help.salesforce.com/s/articleView?id=000383591&type=1
 *
 * @param nango - The NangoAction instance used for making API requests.
 * @param validationRulesIds - An array of objects containing the IDs and names of the validation rules.
 * @returns A promise that resolves to an array of ValidationRecord objects with metadata for each validation rule.
 */
async function fetchValidationRuleMetadata(nango: NangoAction, validationRulesIds: { Id: string; ValidationName: string }[]): Promise<ValidationRecord[]> {
    const metadataFetchPromises: Promise<ValidationRecord>[] = validationRulesIds.map((rule) =>
        nango
            .get<ValidationRuleResponse>({
                endpoint: `/services/data/v60.0/tooling/query`,
                retries: 10,
                params: {
                    q: `SELECT Id, ValidationName, Metadata FROM ValidationRule WHERE Id='${rule.Id}'`
                }
            })
            .then((response: { data: ValidationRuleResponse }) => {
                const record = response.data.records[0];
                if (record) {
                    return { ...record, ValidationName: rule.ValidationName };
                }
                throw new nango.ActionError({
                    message: `Validation rule with ID ${rule.Id} not found.`
                });
            })
    );

    const settledResults = await Promise.allSettled(metadataFetchPromises);

    return settledResults.filter((result) => result.status === 'fulfilled').map((result) => (result as PromiseFulfilledResult<ValidationRecord>).value);
}

/**
 * Maps the fields from the Salesforce API response to the Field schema.
 * @param fields - Array of fields from Salesforce
 * @returns An array of mapped validation rules conforming to the Field schema.
 */
function mapFields(fields: SalesForceField[]): Field[] {
    return fields.map((field) =>
        fieldSchema.parse({
            name: field.name,
            label: field.label,
            type: field.type,
            referenceTo: field.referenceTo,
            relationshipName: field.relationshipName
        })
    );
}

/**
 * Maps child relationships from Salesforce API to the ChildField schema.
 * @param relationships - Array of child relationships from Salesforce
 * @returns An array of mapped child relationships conforming to the ChildField schema.
 */
function mapChildRelationships(relationships: ChildRelationship[]): ChildField[] {
    return relationships.map((relationship) =>
        childFieldSchema.parse({
            object: relationship.childSObject,
            field: relationship.field,
            relationshipName: relationship.relationshipName
        })
    );
}

/**
 * Maps validation rules from Salesforce Tooling API response to the ValidationRule schema.
 * @param validationRules - Array of validation rules from Salesforce Tooling API
 * @returns An array of mapped validation rules conforming to the ValidationRule schema.
 */
function mapValidationRules(validationRules: ValidationRecord[]): ValidationRule[] {
    return validationRules.map((rule) =>
        validationRuleSchema.parse({
            id: rule.Id,
            name: rule.ValidationName,
            errorConditionFormula: rule.Metadata.errorConditionFormula,
            errorMessage: rule.Metadata.errorMessage
        })
    );
}
