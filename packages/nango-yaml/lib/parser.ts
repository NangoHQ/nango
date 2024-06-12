import type { NangoYaml, NangoYamlParsed } from '@nangohq/types';
import { ModelsParser } from './modelsParser.js';
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

    abstract parse(): void;
}
