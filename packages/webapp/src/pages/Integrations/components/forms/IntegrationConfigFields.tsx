import { AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import { z } from 'zod';

import { Alert, AlertDescription, InputGroup, InputGroupInput } from '@nangohq/design-system';

import { SecretInput } from '@/components/patterns/SecretInput';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { isIntegrationConfigFieldVisible } from '@/utils/integrationConfig';

import type { SimplifiedJSONSchema } from '@nangohq/types';
import type { Control } from 'react-hook-form';

export type IntegrationConfigFieldEntry = [string, SimplifiedJSONSchema];
export type IntegrationConfigValues = Record<string, string | undefined>;

export function useIntegrationConfigFormPieces(schema: Record<string, SimplifiedJSONSchema> | undefined) {
    const fields = useMemo<IntegrationConfigFieldEntry[]>(() => Object.entries(schema ?? {}).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0)), [schema]);

    const schemaMap = useMemo(() => schema ?? {}, [schema]);

    const defaultValues = useMemo(
        () =>
            Object.fromEntries(fields.map(([name, def]) => [name, def.default_value ?? (def.enum && !def.optional ? (def.enum[0] ?? '') : '')])) as Record<
                string,
                string
            >,
        [fields]
    );

    return { fields, schemaMap, defaultValues };
}

// Validate against the field schema, but only for fields that are currently visible (their
// `visible_when` is satisfied). Hidden fields don't apply to the chosen configuration, so a
// required-but-hidden field (e.g. built-in credentials in custom mode) isn't enforced.
export function buildIntegrationConfigSchema(fields: IntegrationConfigFieldEntry[], schemaMap: Record<string, SimplifiedJSONSchema>) {
    return z.object(Object.fromEntries(fields.map(([name]) => [name, z.string().optional()]))).superRefine((data, ctx) => {
        const values = data as IntegrationConfigValues;
        for (const [name, def] of fields) {
            if (!isIntegrationConfigFieldVisible(name, schemaMap, values)) {
                continue;
            }
            const value = values[name] ?? '';
            if (!value) {
                if (!def.optional) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: 'This field is required' });
                }
                continue;
            }
            if (def.enum && def.enum.length > 0 && !def.enum.includes(value)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: `Must be one of: ${def.enum.join(', ')}` });
                continue;
            }
            if (def.format === 'uri') {
                let protocol: string | undefined;
                try {
                    protocol = new URL(value).protocol;
                } catch {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: 'Must be a valid URL' });
                    continue;
                }
                if (protocol !== 'http:' && protocol !== 'https:') {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: 'Must be an http(s) URL' });
                    continue;
                }
            }
            if (def.format === 'hostname' && !/^[a-zA-Z0-9.-]+$/.test(value)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: 'Must be a valid hostname' });
                continue;
            }
            if (def.format === 'uuid' && !z.string().uuid().safeParse(value).success) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: 'Must be a valid UUID' });
                continue;
            }
            if (def.format === 'email' && !z.string().email().safeParse(value).success) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: 'Must be a valid email' });
                continue;
            }
            if (def.pattern) {
                try {
                    if (!new RegExp(def.pattern).test(value)) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: `Invalid ${def.title}` });
                    }
                } catch {
                    // Ignore an invalid pattern in the provider schema.
                }
            }
        }
    });
}

/** Keeps only the fields that apply given the chosen configuration (hidden ones don't belong in the submission). */
export function filterVisibleIntegrationConfig(formData: IntegrationConfigValues, schemaMap: Record<string, SimplifiedJSONSchema>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(formData).filter(
            (entry): entry is [string, string] => entry[1] !== undefined && isIntegrationConfigFieldVisible(entry[0], schemaMap, formData)
        )
    );
}

export const IntegrationConfigFormFields: React.FC<{
    control: Control<IntegrationConfigValues>;
    fields: IntegrationConfigFieldEntry[];
    schemaMap: Record<string, SimplifiedJSONSchema>;
    watched: IntegrationConfigValues;
}> = ({ control, fields, schemaMap, watched }) => (
    <>
        {fields
            .filter(([name]) => isIntegrationConfigFieldVisible(name, schemaMap, watched))
            .map(([name, definition]) => (
                <FormField
                    key={name}
                    control={control}
                    name={name}
                    render={({ field, fieldState }) => {
                        const warning = definition.warnings?.[field.value as string];
                        return (
                            <FormItem>
                                <FormLabel>{definition.title}</FormLabel>
                                {definition.description && <FormDescription>{definition.description}</FormDescription>}
                                {definition.enum && definition.enum.length > 0 ? (
                                    <Select value={field.value as string} onValueChange={field.onChange}>
                                        <FormControl>
                                            <SelectTrigger className="w-full" aria-invalid={!!fieldState.error}>
                                                <SelectValue placeholder={definition.title} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {definition.enum.map((option) => (
                                                <SelectItem key={option} value={option}>
                                                    {option}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <FormControl>
                                        {definition.secret ? (
                                            <SecretInput {...field} aria-invalid={!!fieldState.error} />
                                        ) : (
                                            <InputGroup>
                                                <InputGroupInput {...field} placeholder={definition.example} aria-invalid={!!fieldState.error} />
                                            </InputGroup>
                                        )}
                                    </FormControl>
                                )}
                                {warning && (
                                    <Alert variant="warning">
                                        <AlertTriangle />
                                        <AlertDescription>{warning}</AlertDescription>
                                    </Alert>
                                )}
                                <FormMessage />
                            </FormItem>
                        );
                    }}
                />
            ))}
    </>
);
