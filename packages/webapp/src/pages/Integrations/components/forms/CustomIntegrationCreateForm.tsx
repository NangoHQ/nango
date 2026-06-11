import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@nangohq/design-system';

import { SecretInput } from '@/components/patterns/SecretInput';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { InputGroup, InputGroupInput } from '@/components/ui/InputGroup';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { isIntegrationConfigFieldVisible } from '@/utils/integrationConfig';

import type { ApiProviderListItem, PostIntegration, SimplifiedJSONSchema } from '@nangohq/types';

type FieldEntry = [string, SimplifiedJSONSchema];

/**
 * Renders the custom integration configuration form from a provider's `integration_config`
 * (e.g. the `private-api-generic` API-key provider). Submitted values are persisted to the
 * integration's `custom` field server-side.
 */
export const CustomIntegrationCreateForm: React.FC<{
    provider: ApiProviderListItem;
    onSubmit?: (data: PostIntegration['Body']) => Promise<void>;
}> = ({ provider, onSubmit }) => {
    const fields = useMemo<FieldEntry[]>(
        () => Object.entries(provider.integration_config ?? {}).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0)),
        [provider.integration_config]
    );

    const schemaMap = useMemo(() => provider.integration_config ?? {}, [provider.integration_config]);

    // Validate against the field schema, but only for fields that are currently visible (their
    // `visible_when` is satisfied). Hidden fields don't apply to the chosen configuration, so a
    // required-but-hidden field (e.g. built-in credentials in custom mode) isn't enforced.
    const schema = useMemo(
        () =>
            z.object(Object.fromEntries(fields.map(([name]) => [name, z.string().optional()]))).superRefine((data, ctx) => {
                const values = data as Record<string, string | undefined>;
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
            }),
        [fields, schemaMap]
    );

    const defaultValues = useMemo(
        () =>
            Object.fromEntries(fields.map(([name, def]) => [name, def.default_value ?? (def.enum && !def.optional ? (def.enum[0] ?? '') : '')])) as Record<
                string,
                string
            >,
        [fields]
    );

    const form = useForm({ resolver: zodResolver(schema), defaultValues });

    const [loading, setLoading] = useState(false);

    const onSubmitForm = async (formData: Record<string, string | undefined>) => {
        setLoading(true);
        try {
            // Only submit fields that apply to the chosen configuration; hidden ones don't belong.
            const integrationConfig = Object.fromEntries(
                Object.entries(formData).filter(
                    (entry): entry is [string, string] => entry[1] !== undefined && isIntegrationConfigFieldVisible(entry[0], schemaMap, formData)
                )
            );
            await onSubmit?.({
                provider: provider.name,
                useSharedCredentials: false,
                integrationConfig
            });
        } finally {
            setLoading(false);
        }
    };

    // Re-render as the user changes discriminator fields so dependent fields appear/disappear.
    const watched = form.watch();

    return (
        <div className="flex flex-col gap-8">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitForm)} className="flex flex-col gap-8">
                    <div className="flex flex-col gap-5">
                        {fields
                            .filter(([name]) => isIntegrationConfigFieldVisible(name, schemaMap, watched as Record<string, string | undefined>))
                            .map(([name, definition]) => (
                                <FormField
                                    key={name}
                                    control={form.control}
                                    name={name}
                                    render={({ field, fieldState }) => {
                                        const warning = definition.warnings?.[field.value as string];
                                        return (
                                            <FormItem>
                                                <FormLabel>{definition.title}</FormLabel>
                                                {definition.description && <FormDescription>{definition.description}</FormDescription>}
                                                <FormControl>
                                                    {definition.enum && definition.enum.length > 0 ? (
                                                        <Select value={field.value as string} onValueChange={field.onChange}>
                                                            <SelectTrigger className="w-full" aria-invalid={!!fieldState.error}>
                                                                <SelectValue placeholder={definition.title} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {definition.enum.map((option) => (
                                                                    <SelectItem key={option} value={option}>
                                                                        {option}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : definition.secret ? (
                                                        <InputGroup>
                                                            <SecretInput {...field} aria-invalid={!!fieldState.error} />
                                                        </InputGroup>
                                                    ) : (
                                                        <InputGroup>
                                                            <InputGroupInput {...field} placeholder={definition.example} aria-invalid={!!fieldState.error} />
                                                        </InputGroup>
                                                    )}
                                                </FormControl>
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
                    </div>

                    <Button type="submit" loading={loading}>
                        Create
                    </Button>
                </form>
            </Form>
        </div>
    );
};
