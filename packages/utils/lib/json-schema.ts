import { Err, Ok } from './result.js';

import type { Result } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

/**
 * Creates a new JSON schema with only the definitions for the given models.
 */
export function filterJsonSchemaForModels(jsonSchema: JSONSchema7, models: string[]): Result<JSONSchema7> {
    if (!jsonSchema.definitions || Object.keys(jsonSchema.definitions).length === 0) {
        return Ok({});
    }

    const definitions: Record<string, JSONSchema7> = {};

    const visitedDefinitions = new Set<JSONSchema7>();

    for (const model of models) {
        const definitionsResult = getDefinitionsRecursively(model, jsonSchema, visitedDefinitions);
        if (definitionsResult.isErr()) {
            return Err(definitionsResult.error);
        }

        for (const [name, definition] of Object.entries(definitionsResult.value)) {
            definitions[name] = definition;
        }
    }

    return Ok({ definitions });
}

export function getDefinition(name: string, rootSchema: JSONSchema7): Result<JSONSchema7> {
    const schema = rootSchema.definitions?.[name];
    if (!schema || typeof schema !== 'object') {
        return Err(new Error(`json_schema doesn't contain model "${name}"`));
    }
    return Ok(schema);
}

/**
 * Gets all definitions recursively from a JSON schema (the top level definition and all its references)
 */
export function getDefinitionsRecursively(
    name: string,
    rootSchema: JSONSchema7,
    visitedDefinitions = new Set<JSONSchema7>()
): Result<Record<string, JSONSchema7>> {
    const definitions: Record<string, JSONSchema7> = {};

    const schema = getDefinition(name, rootSchema);
    if (schema.isErr()) {
        return Err(schema.error);
    }

    if (visitedDefinitions.has(schema.value)) {
        return Ok(definitions);
    }

    definitions[name] = schema.value;
    visitedDefinitions.add(schema.value);

    const references = findReferencesInSchema(schema.value, rootSchema);
    for (const reference of references) {
        const definitionsResult = getDefinitionsRecursively(reference, rootSchema, visitedDefinitions);
        if (definitionsResult.isErr()) {
            return Err(definitionsResult.error);
        }

        for (const [name, definition] of Object.entries(definitionsResult.value)) {
            definitions[name] = definition;
        }
    }

    return Ok(definitions);
}

/**
 * Finds all references in a JSON schema.
 */
function findReferencesInSchema(schema: JSONSchema7, rootSchema: JSONSchema7): string[] {
    if (typeof schema !== 'object' || schema === null) {
        return [];
    }

    if (schema.$ref) {
        const reference = schema.$ref.replace('#/definitions/', '');
        return [reference];
    }

    const references: string[] = [];

    if (schema.properties) {
        for (const property of Object.values(schema.properties)) {
            references.push(...findReferencesInSchema(property as JSONSchema7, rootSchema));
        }
    }

    if (schema.items) {
        if (Array.isArray(schema.items)) {
            for (const item of schema.items) {
                references.push(...findReferencesInSchema(item as JSONSchema7, rootSchema));
            }
        } else {
            references.push(...findReferencesInSchema(schema.items as JSONSchema7, rootSchema));
        }
    }

    const complexSchemas = schema.oneOf || schema.anyOf || schema.allOf;
    if (complexSchemas) {
        for (const complexSchema of complexSchemas) {
            references.push(...findReferencesInSchema(complexSchema as JSONSchema7, rootSchema));
        }
    }

    if (schema.definitions) {
        for (const property of Object.values(schema.definitions)) {
            references.push(...findReferencesInSchema(property as JSONSchema7, rootSchema));
        }
    }

    return references;
}
