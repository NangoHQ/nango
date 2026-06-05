import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { SecretInput } from '@/components/patterns/SecretInput';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { InputGroup, InputGroupInput } from '@/components/ui/InputGroup';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';

import type { ApiProviderListItem, PostIntegration, SimplifiedJSONSchema } from '@nangohq/types';

type FieldEntry = [string, SimplifiedJSONSchema];

function fieldToZod(definition: SimplifiedJSONSchema): z.ZodTypeAny {
    if (definition.enum && definition.enum.length > 0) {
        const base = z.enum(definition.enum as [string, ...string[]]);
        return definition.optional ? z.union([base, z.literal('')]) : base;
    }

    let field = z.string();
    if (definition.format === 'uri') {
        field = field.url('Must be a valid URL');
    }
    if (definition.pattern) {
        field = field.regex(new RegExp(definition.pattern), { message: `Invalid ${definition.title}` });
    }

    if (definition.optional) {
        return z.union([field, z.literal('')]);
    }
    return field.min(1, 'This field is required');
}

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

    const schema = useMemo(() => z.object(Object.fromEntries(fields.map(([name, def]) => [name, fieldToZod(def)]))), [fields]);

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

    const onSubmitForm = async (formData: Record<string, string>) => {
        setLoading(true);
        try {
            await onSubmit?.({
                provider: provider.name,
                useSharedCredentials: false,
                integrationConfig: formData
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitForm)} className="flex flex-col gap-8">
                    <div className="flex flex-col gap-5">
                        {fields.map(([name, definition]) => (
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
