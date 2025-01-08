import type { NangoModel, NangoModelField, NangoYamlModel, NangoYamlModelFields } from '@nangohq/types';
import { getNativeDataType, getPotentialTypeAlias, isDisallowedType, shouldQuote } from './helpers.js';
import { ParserError, ParserErrorCycle, ParserErrorExtendsNotFound, ParserErrorInvalidModelName, ParserErrorTypeSyntax } from './errors.js';

export class ModelsParser {
    parsed = new Map<string, NangoModel>();
    references = new Set<string>();
    errors: ParserError[] = [];
    warnings: ParserError[] = [];

    raw: NangoYamlModel;

    constructor({ raw }: { raw: NangoYamlModel }) {
        this.raw = raw;
    }

    parseAll() {
        for (const [name, fields] of Object.entries(this.raw)) {
            if (shouldQuote(name)) {
                this.errors.push(new ParserErrorInvalidModelName({ model: name, path: [name] }));
                continue;
            }
            if (this.parsed.has(name)) {
                continue;
            }

            this.parseOne({ name, fields, stack: new Set([name]) });
        }
    }

    get(name: string): NangoModel | undefined {
        const parsed = this.parsed.get(name);
        if (!parsed) {
            return undefined;
        }

        return parsed;
    }

    parseOne({ name, fields, stack }: { name: string; fields: NangoYamlModelFields; stack: Set<string> }): void {
        const parsed = this.parseFields({ fields, stack });
        if (parsed) {
            this.parsed.set(name, { name, fields: parsed });
        }
    }

    ifModelParse({ name, stack }: { name: string; stack: Set<string> }): true | false {
        if (stack.has(name)) {
            this.warnings.push(new ParserErrorCycle({ stack }));
            return true;
        }

        // Previously parsed skip things
        const has = this.parsed.get(name);
        if (has) {
            return true;
        }

        // Model does not exist but that could just mean string literal
        if (!this.raw[name]) {
            this.warnings.push(
                new ParserError({
                    code: 'model_not_found_fallback',
                    message: `Model "${name}" is not defined, using as string literal`,
                    path: [...Array.from(stack), name]
                })
            );
            return false;
        }

        // At this point we are sure it's a Model
        stack.add(name);
        this.parseOne({ name, fields: this.raw[name], stack });
        return true;
    }

    parseFields({ fields, stack }: { fields: NangoYamlModelFields; stack: Set<string> }): NangoModelField[] {
        const parsed = new Map<string, NangoModelField>();
        let dynamicField: NangoModelField | null = null;

        for (const [nameTmp, value] of Object.entries(fields)) {
            const optional = nameTmp.endsWith('?');
            const name = optional ? nameTmp.substring(0, nameTmp.length - 1) : nameTmp;
            const parent = Array.from(stack).pop()!;

            // Special key to extends models
            if (name === '__extends') {
                const extendedModels = (value as string).split(',');

                for (const extendedModel of extendedModels) {
                    const trimmed = extendedModel.trim();
                    const isModel = this.ifModelParse({ name: trimmed, stack });
                    if (!isModel) {
                        this.errors.push(new ParserErrorExtendsNotFound({ model: parent, inherit: trimmed, path: [...Array.from(stack), '__extends'] }));
                        continue;
                    }

                    // Merge parent
                    const extendedFields = this.parsed.get(trimmed)!;
                    for (const field of extendedFields.fields) {
                        if (parsed.has(field.name)) {
                            // field already exists
                            continue;
                        }
                        if (field.dynamic) {
                            dynamicField = field;
                        } else {
                            parsed.set(field.name, field);
                        }
                    }
                }
                continue;
            }

            // Special key for dynamic interface `[key: string]: *`
            if (name === '__string') {
                const acc = this.parseFields({ fields: { tmp: value }, stack })[0]!;
                dynamicField = { ...acc, name, dynamic: true, optional };
                continue;
            }

            // Array of unknown
            if (Array.isArray(value)) {
                const acc = this.parseFields({ fields: value as unknown as NangoYamlModelFields, stack });
                if (!acc) {
                    this.errors.push(new ParserError({ code: 'failed_to_parse_array', message: `Failed to parse array in "${parent}"`, path: [parent, name] }));
                    continue;
                }

                parsed.set(name, { name, value: acc, array: true, optional });
                continue;
            }

            // Standard data types that requires no change
            if (typeof value === 'boolean' || typeof value === 'number' || value === null || value === undefined) {
                parsed.set(name, { name, value, tsType: true });
                continue;
            }

            // Special case for literal objects
            if (typeof value === 'object') {
                const acc = this.parseFields({ fields: value, stack });
                if (!acc) {
                    this.errors.push(
                        new ParserError({ code: 'failed_to_parse_object', message: `Failed to parse object in "${parent}"`, path: [parent, name] })
                    );
                    continue;
                }

                parsed.set(name, { name, value: acc, optional });
                continue;
            }

            // Union type will be split and feed back to the parser
            if (value.includes('|')) {
                // union
                const types = value.split('|').map((v) => v.trim());
                const acc = this.parseFields({ fields: { tmp: types } as unknown as NangoYamlModelFields, stack });

                if (!acc) {
                    this.errors.push(new ParserError({ code: 'failed_to_parse_union', message: `Failed to parse union in "${parent}"`, path: [parent, name] }));
                    continue;
                }

                parsed.set(name, { name, value: acc[0]!.value, union: true, optional });
                continue;
            }

            // At this point it's a regular string but it can still be:
            // - typescript array
            // - native data type (null, true, false)
            // - model
            const isArray = value.endsWith('[]');
            const valueClean = isArray ? value.substring(0, value.length - 2) : value;

            // empty array
            if (valueClean === '') {
                this.errors.push(new ParserErrorTypeSyntax({ value, path: [parent, name] }));
                parsed.set(name, { name, value: valueClean, array: isArray, optional });
                continue;
            }

            const alias = getPotentialTypeAlias(valueClean);
            if (alias) {
                parsed.set(name, { name, value: alias, tsType: true, array: isArray, optional });
                continue;
            }

            const native = getNativeDataType(valueClean);
            if (!(native instanceof Error)) {
                parsed.set(name, { name, value: native, tsType: true, array: isArray, optional });
                continue;
            }

            if (isDisallowedType(valueClean)) {
                this.errors.push(new ParserErrorTypeSyntax({ value: valueClean, path: [parent, name] }));
                parsed.set(name, { name, value: valueClean, array: isArray, optional });
                continue;
            }

            // Model name
            const isModel = this.ifModelParse({ name: valueClean, stack });
            if (isModel) {
                parsed.set(name, { name, value: valueClean, model: true, optional, array: isArray });
                continue;
            }

            // Literal string
            parsed.set(name, { name, value: valueClean, array: isArray, optional });
        }

        if (dynamicField) {
            parsed.set(dynamicField.name, dynamicField);
        }

        return Array.from(parsed.values());
    }
}

/**
 * Get recursively (and safely) all the model names inside a model
 */
export function getRecursiveModelNames(parser: ModelsParser, name: string): Set<string> {
    const model = parser.get(name);
    if (!model) {
        return new Set();
    }
    return getRecursiveModelInModel(parser, model.fields, new Set([name]));
}

function getRecursiveModelInModel(parser: ModelsParser, fields: NangoModel['fields'], names: Set<string>): Set<string> {
    for (const field of fields) {
        if (field.model) {
            if (names.has(field.value as string)) {
                continue;
            }
            names.add(field.value as string);
            const sub = parser.get(field.value as string);
            const res = getRecursiveModelInModel(parser, sub!.fields, names);
            res.forEach((name) => names.add(name));
        }
        if (Array.isArray(field.value)) {
            const res = getRecursiveModelInModel(parser, field.value, names);
            res.forEach((name) => names.add(name));
        }
    }
    return names;
}
