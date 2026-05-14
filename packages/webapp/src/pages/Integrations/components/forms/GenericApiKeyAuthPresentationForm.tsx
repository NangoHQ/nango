import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import z from 'zod';

import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { Button } from '@/components-v2/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components-v2/ui/form';
import { InputGroup, InputGroupInput } from '@/components-v2/ui/input-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components-v2/ui/select';

import type { ApiPublicGenericApiKeyConfig } from '@nangohq/types';

const formSchema = z.object({
    baseUrl: z
        .string()
        .url('Must be a valid HTTPS URL')
        .refine((value) => {
            try {
                return new URL(value).protocol === 'https:';
            } catch {
                return false;
            }
        }, 'Must be an HTTPS URL'),
    placement: z.enum(['header', 'query']),
    name: z
        .string()
        .min(1, 'Must not be empty')
        .max(255)
        .regex(/^[A-Za-z0-9_-]+$/, 'Must only contain letters, numbers, underscores, and dashes'),
    valueTemplate: z
        .string()
        .min(1, 'Must not be empty')
        .max(2048)
        .refine((value) => !/[\r\n]/.test(value), 'Must not contain newlines')
        .refine((value) => value.includes('{apiKey}') || value.includes('${apiKey}'), 'Must include {apiKey}'),
    verificationMethod: z.enum(['GET', 'POST']),
    verificationEndpoint: z
        .string()
        .max(2048)
        .refine((value) => !value || value.startsWith('/'), 'Must start with /')
        .refine((value) => !value.startsWith('//'), 'Must be a relative path')
});

type FormData = z.infer<typeof formSchema>;

interface Props {
    initialValue?: ApiPublicGenericApiKeyConfig | undefined;
    submitLabel: string;
    onSubmit: (data: ApiPublicGenericApiKeyConfig) => Promise<void>;
}

function toFormDefaults(value?: ApiPublicGenericApiKeyConfig): FormData {
    return {
        baseUrl: value?.base_url ?? '',
        placement: value?.placement ?? 'header',
        name: value?.name ?? 'Authorization',
        valueTemplate: value?.value_template ?? '{apiKey}',
        verificationMethod: value?.verification?.method ?? 'GET',
        verificationEndpoint: value?.verification?.endpoint ?? ''
    };
}

function toApiConfig(data: FormData): ApiPublicGenericApiKeyConfig {
    return {
        base_url: data.baseUrl,
        placement: data.placement,
        name: data.name,
        value_template: data.valueTemplate,
        ...(data.verificationEndpoint
            ? {
                  verification: {
                      method: data.verificationMethod,
                      endpoint: data.verificationEndpoint
                  }
              }
            : {})
    };
}

export const GenericApiKeyAuthPresentationForm: React.FC<Props> = ({ initialValue, submitLabel, onSubmit }) => {
    const [loading, setLoading] = useState(false);
    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: toFormDefaults(initialValue)
    });

    const placement = useWatch({ control: form.control, name: 'placement' });
    const verificationEndpoint = useWatch({ control: form.control, name: 'verificationEndpoint' });
    const nameLabel = placement === 'query' ? 'Query parameter name' : 'Header name';
    const namePlaceholder = placement === 'query' ? 'api_key' : 'x-api-key';
    const placementDescription =
        placement === 'query'
            ? 'Nango will append the API key to upstream requests as this query parameter.'
            : 'Nango will add the API key to upstream requests as this HTTP header.';

    const onSubmitForm = async (formData: FormData) => {
        setLoading(true);

        try {
            await onSubmit(toApiConfig(formData));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save Generic API Key configuration';
            form.setError('baseUrl', { type: 'server', message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitForm)} className="flex flex-col gap-8">
                <Alert variant="info">
                    <AlertDescription>
                        Configure how Nango sends the stored API key to the upstream API. Connection users will only enter the API key itself.
                    </AlertDescription>
                </Alert>

                <div className="flex flex-col gap-5">
                    <FormField
                        control={form.control}
                        name="baseUrl"
                        render={({ field, fieldState }) => (
                            <FormItem>
                                <FormLabel>Base URL</FormLabel>
                                <FormControl>
                                    <InputGroup>
                                        <InputGroupInput {...field} placeholder="https://api.example.com" aria-invalid={!!fieldState.error} />
                                    </InputGroup>
                                </FormControl>
                                <FormDescription>The root URL Nango should proxy requests to, without the endpoint path.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="placement"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>API key placement</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <FormControl>
                                        <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="header">Header</SelectItem>
                                        <SelectItem value="query">Query parameter</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormDescription>{placementDescription}</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field, fieldState }) => (
                            <FormItem>
                                <FormLabel>{nameLabel}</FormLabel>
                                <FormControl>
                                    <InputGroup>
                                        <InputGroupInput {...field} placeholder={namePlaceholder} aria-invalid={!!fieldState.error} />
                                    </InputGroup>
                                </FormControl>
                                <FormDescription>
                                    Use the exact {placement === 'query' ? 'query parameter' : 'header'} name from the upstream API documentation.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="valueTemplate"
                        render={({ field, fieldState }) => (
                            <FormItem>
                                <FormLabel>Value format</FormLabel>
                                <FormControl>
                                    <InputGroup>
                                        <InputGroupInput {...field} placeholder="{apiKey}" aria-invalid={!!fieldState.error} />
                                    </InputGroup>
                                </FormControl>
                                <FormDescription>
                                    Use {'{apiKey}'} where Nango should insert the stored key. Examples: {'{apiKey}'}, Bearer {'{apiKey}'}, Api-Key {'{apiKey}'}
                                    .
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="verificationEndpoint"
                        render={({ field, fieldState }) => (
                            <FormItem>
                                <FormLabel>Verification endpoint (optional)</FormLabel>
                                <FormControl>
                                    <InputGroup>
                                        <InputGroupInput {...field} placeholder="/v1/me" aria-invalid={!!fieldState.error} />
                                    </InputGroup>
                                </FormControl>
                                <FormDescription>
                                    Add a relative endpoint Nango can call after credential entry. Leave empty to skip connection verification.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {verificationEndpoint && (
                        <FormField
                            control={form.control}
                            name="verificationMethod"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Verification method</FormLabel>
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <FormControl>
                                            <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="GET">GET</SelectItem>
                                            <SelectItem value="POST">POST</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        Nango uses GET by default. Choose POST only if the upstream verification endpoint requires it.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}
                </div>

                <Button type="submit" loading={loading}>
                    {submitLabel}
                </Button>
            </form>
        </Form>
    );
};
