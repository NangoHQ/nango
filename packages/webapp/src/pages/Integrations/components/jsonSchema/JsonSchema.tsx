import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { isAnyOfSchema, isArraySchema, isObjectSchema, isOneOfSchema, typeToString } from './utils';
import { CatalogBadge } from '../CatalogBadge';
import { IntegrationsBadge } from '../IntegrationsBadge';
import { cn } from '@/utils/utils';

import type { JSONSchema7, JSONSchema7Type } from 'json-schema';

export const JsonSchemaTopLevelObject: React.FC<{ schema: JSONSchema7 }> = ({ schema }) => {
    if (!isObjectSchema(schema)) {
        throw new Error('Expected object schema.');
    }

    return (
        <div className="flex flex-col gap-1.5">
            {Object.entries(schema.properties || {}).map(([name, property]) => (
                <TopLevelWrapper key={name}>
                    <JsonSchema name={name} schema={property as JSONSchema7} isRequired={schema.required?.includes(name)} depth={0} />
                </TopLevelWrapper>
            ))}
        </div>
    );
};

const JsonSchema: React.FC<{ name: string; schema: JSONSchema7; depth: number; isArray?: boolean; isRequired?: boolean }> = ({
    name,
    schema,
    isArray = false,
    isRequired = false,
    depth
}) => {
    if (isOneOfSchema(schema) || isAnyOfSchema(schema)) {
        return <JsonSchemaOneOf name={name} schema={schema} isArray={isArray} depth={depth} />;
    }

    if (isObjectSchema(schema)) {
        return <JsonSchemaObject name={name} schema={schema} isArray={isArray} depth={depth} />;
    }

    if (isArraySchema(schema)) {
        return <JsonSchema name={name} schema={schema.items as JSONSchema7} isArray={true} depth={depth} />;
    }

    return (
        <JsonSchemaGenericInfo
            name={name}
            type={typeToString(schema, isArray)}
            description={schema.description}
            depth={depth}
            isRequired={isRequired}
            defaultValue={schema.default}
        />
    );
};

const JsonSchemaGenericInfo: React.FC<{
    name: string;
    description?: string | undefined;
    type: string;
    depth: number;
    isRequired?: boolean;
    defaultValue?: JSONSchema7Type | undefined;
}> = ({ name, description, type, depth, isRequired, defaultValue }) => {
    const defaultString =
        typeof defaultValue === 'string' || typeof defaultValue === 'number' || typeof defaultValue === 'boolean' ? String(defaultValue) : null;
    return (
        <div className="w-full flex flex-row items-center justify-between gap-1.5">
            <div className="flex flex-col gap-1.5">
                <span className="text-text-primary text-body-small-semi">{name}</span>{' '}
                {description && <p className="text-text-tertiary text-body-small-medium">{description}</p>}
                {defaultString && <IntegrationsBadge label="Default">{defaultString}</IntegrationsBadge>}
            </div>
            <div className="flex gap-1 5">
                <CatalogBadge variant={depth % 2 === 0 ? 'dark' : 'light'}>{type}</CatalogBadge>
                {isRequired && <CatalogBadge variant="red">required</CatalogBadge>}
            </div>
        </div>
    );
};
const JsonSchemaObject: React.FC<{ name: string; schema: JSONSchema7; isArray?: boolean; depth: number }> = ({ name, schema, isArray = false, depth = 0 }) => {
    if (!isObjectSchema(schema)) {
        throw new Error('Expected object schema.');
    }

    const hasProperties = Object.keys(schema.properties || {}).length > 0 || schema.additionalProperties;

    return (
        <div className="flex flex-col gap-3">
            <JsonSchemaGenericInfo name={name} type={typeToString(schema, isArray)} description={schema.description} depth={depth} />
            {hasProperties && <CollapsibleProperties schema={schema} depth={depth + 1} />}
        </div>
    );
};

const JsonSchemaOneOf: React.FC<{ name: string; schema: JSONSchema7; isArray?: boolean; depth: number }> = ({ name, schema, isArray = false, depth = 0 }) => {
    if (!isOneOfSchema(schema) && !isAnyOfSchema(schema)) {
        throw new Error('Expected oneOf or anyOf schema.');
    }

    const schemas = schema.oneOf || schema.anyOf || [];

    return (
        <div className="flex flex-col gap-3">
            <JsonSchemaGenericInfo
                name={name}
                type={typeToString(schema, isArray)}
                description={schema.description}
                defaultValue={schema.default}
                depth={depth}
            />
            <div className="flex flex-col gap-3">
                {schemas
                    .filter((s) => isObjectSchema(s as JSONSchema7))
                    .map((s, index) => (
                        <CollapsibleProperties key={index} schema={s as JSONSchema7} depth={depth + 1} />
                    ))}
            </div>
        </div>
    );
};

const CollapsibleProperties: React.FC<{ schema: JSONSchema7; depth: number }> = ({ schema, depth }) => {
    const [open, setOpen] = useState(false);

    if (!isObjectSchema(schema)) {
        throw new Error('Expected object schema.');
    }
    const { properties, required } = schema;

    const propertyCount = properties ? Object.keys(properties).length : 0;
    return (
        <Collapsible.Root open={open} onOpenChange={setOpen} disabled={propertyCount === 0}>
            <Collapsible.Trigger asChild>
                <div
                    className={cn(
                        'group w-full p-4 flex flex-row items-center justify-between rounded focus-default cursor-pointer transition-all',
                        depth % 2 === 0 ? 'bg-bg-elevated' : 'bg-bg-surface'
                    )}
                >
                    <div className="inline-flex gap-1 items-center">
                        <span className="text-text-primary text-body-small-semi grow">{open ? 'Hide child attributes' : 'Show child attributes'}</span>
                        <ChevronDown className="size-4 text-icon-primary group-data-[state=open]:rotate-180" />
                    </div>
                    <span className="text-text-primary text-body-small-medium">{propertyCount}</span>
                </div>
            </Collapsible.Trigger>
            <Collapsible.Content asChild>
                <div className={cn('group/collapsible p-4 pt-0 rounded-b', depth % 2 === 0 ? 'bg-bg-elevated' : 'bg-bg-surface')}>
                    {Object.entries(properties || {}).map(([name, property]) => (
                        <div
                            key={name}
                            className={cn('p-4 border-b last:border-b-0', depth % 2 === 0 ? 'border-border-extra-strong' : 'border-border-default')}
                        >
                            <JsonSchema name={name} schema={property as JSONSchema7} isRequired={required?.includes(name)} depth={depth} />
                        </div>
                    ))}
                    {schema.additionalProperties &&
                        (typeof schema.additionalProperties === 'object' ? (
                            <JsonSchema name="{key}" schema={schema.additionalProperties} depth={depth} />
                        ) : (
                            <JsonSchemaGenericInfo name="{key}" type="any" depth={depth} />
                        ))}
                </div>
            </Collapsible.Content>
        </Collapsible.Root>
    );
};

const TopLevelWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <div className="p-4 bg-bg-elevated rounded flex flex-col gap-3">{children}</div>;
};
