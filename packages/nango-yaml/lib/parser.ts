import type { NangoModel, NangoYaml, NangoYamlParsed } from '@nangohq/types';
import { ModelsParser } from './modelsParser.js';
import { ParserErrorDuplicateModel, ParserErrorMissingId, ParserErrorModelIsLiteral } from './errors.js';
import type { ParserError } from './errors.js';

export abstract class NangoYamlParser {
    raw: NangoYaml;
    parsed: NangoYamlParsed | undefined;
    modelsParser: ModelsParser;
    // check that every endpoint is unique across syncs and actions
    endpoints = new Set<string>();

    errors: ParserError[] = [];
    warnings: ParserError[] = [];

    constructor({ raw }: { raw: NangoYaml }) {
        this.raw = raw;
        this.modelsParser = new ModelsParser({ raw: raw.models });
    }

    abstract parse(): boolean;

    getModelForOutput({
        rawOutput,
        usedModels,
        name,
        type,
        integrationName
    }: {
        rawOutput: string | string[] | undefined;
        usedModels: Set<string>;
        name: string;
        type: 'sync' | 'action';
        integrationName: string;
    }): NangoModel[] | null {
        if (!rawOutput) {
            return null;
        }

        const models: NangoModel[] = [];

        const output = Array.isArray(rawOutput) ? rawOutput : [rawOutput];
        for (const modelOrType of output) {
            const model = this.modelsParser.get(modelOrType);
            if (model) {
                if (type === 'sync' && usedModels.has(modelOrType)) {
                    this.errors.push(new ParserErrorDuplicateModel({ model: modelOrType, path: [integrationName, type, name, '[output]'] }));
                    continue;
                }

                usedModels.add(modelOrType);
                models.push(model);

                if (type === 'sync' && !model.fields.find((field) => field.name === 'id')) {
                    this.errors.push(new ParserErrorMissingId({ model: modelOrType, path: [integrationName, type, name, '[output]'] }));
                    continue;
                }
                continue;
            }

            // Create anonymous model for validation
            const parsed = this.modelsParser.parseFields({ fields: { output: modelOrType }, parent: name });

            this.warnings.push(new ParserErrorModelIsLiteral({ model: modelOrType, path: [integrationName, type, name, '[output]'] }));

            const anon = `Anonymous_${integrationName.replace(/[^A-Za-z0-9_]/g, '')}_${type}_${name.replace(/[^A-Za-z0-9_]/g, '')}_output`;
            const anonModel: NangoModel = { name: anon, fields: parsed, isAnon: true };
            this.modelsParser.parsed.set(anon, anonModel);
            usedModels.add(anon);
            models.push(anonModel);
        }

        return models;
    }
}
