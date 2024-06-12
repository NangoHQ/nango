import type { NangoModel, NangoYaml, NangoYamlParsed } from '@nangohq/types';
import { ModelsParser } from './modelsParser.js';
import { ParserErrorDuplicateModel, ParserErrorModelNotFound, ParserErrorMissingId } from './errors.js';
import type { ParserError } from './errors.js';
import { isJsOrTsType } from './helpers.js';

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

    abstract parse(): void;

    getModelForOutput({
        rawOutput,
        usedModels,
        name,
        type
    }: {
        rawOutput: string | string[] | undefined;
        usedModels: Set<string>;
        name: string;
        type: 'sync' | 'action';
    }): NangoModel[] | null {
        if (!rawOutput) {
            return null;
        }

        const models: NangoModel[] = [];

        const output = Array.isArray(rawOutput) ? rawOutput : [rawOutput];
        for (const modelOrType of output) {
            if (isJsOrTsType(modelOrType)) {
                continue;
            }

            if (type === 'sync' && usedModels.has(modelOrType)) {
                this.errors.push(new ParserErrorDuplicateModel({ model: modelOrType, path: `${type} > ${name}` }));
                continue;
            }

            const model = this.modelsParser.get(modelOrType);
            if (!model) {
                this.errors.push(new ParserErrorModelNotFound({ model: modelOrType, path: `${type} > ${name}` }));
                continue;
            }

            usedModels.add(modelOrType);

            if (type === 'sync' && !model.fields.find((field) => field.name === 'id')) {
                this.errors.push(new ParserErrorMissingId({ model: modelOrType, path: `${type} > ${name}` }));
                continue;
            }

            models.push(model);
        }

        return models;
    }
}
