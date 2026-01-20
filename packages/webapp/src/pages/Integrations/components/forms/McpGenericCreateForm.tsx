import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { Button } from '@/components-v2/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components-v2/ui/form';
import { InputGroup, InputGroupInput } from '@/components-v2/ui/input-group';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

const formSchema = z.object({
    clientName: z.string().optional(),
    clientUri: z.string().url('Must be a valid URL (e.g., https://example.com)').optional(),
    clientLogoUri: z.string().url('Must be a valid URL (e.g., https://example.com/logo.png)').optional()
});

type FormData = z.infer<typeof formSchema>;

export const McpGenericCreateForm: React.FC<{ provider: ApiProviderListItem; onSubmit?: (data: PostIntegration['Body']) => Promise<void> }> = ({
    provider,
    onSubmit
}) => {
    const form = useForm({
        resolver: zodResolver(formSchema)
    });

    const [loading, setLoading] = useState(false);

    const onSubmitForm = async (formData: FormData) => {
        setLoading(true);
        try {
            await onSubmit?.({
                provider: provider.name,
                useSharedCredentials: false,
                auth: {
                    authType: provider.authMode as Extract<typeof provider.authMode, 'MCP_OAUTH2_GENERIC'>,
                    clientName: formData.clientName,
                    clientUri: formData.clientUri,
                    clientLogoUri: formData.clientLogoUri
                }
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
                        <FormField
                            control={form.control}
                            name="clientName"
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <FormLabel>OAuth Client Name</FormLabel>
                                    <FormControl>
                                        <InputGroup>
                                            <InputGroupInput {...field} aria-invalid={!!fieldState.error} />
                                        </InputGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="clientUri"
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <FormLabel>OAuth Client URI</FormLabel>
                                    <FormControl>
                                        <InputGroup>
                                            <InputGroupInput {...field} placeholder="e.g., https://example.com" aria-invalid={!!fieldState.error} />
                                        </InputGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="clientLogoUri"
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <FormLabel>OAuth Client Logo URI</FormLabel>
                                    <FormControl>
                                        <InputGroup>
                                            <InputGroupInput {...field} placeholder="e.g., https://example.com/logo.png" aria-invalid={!!fieldState.error} />
                                        </InputGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <Button type="submit" loading={loading}>
                        Create
                    </Button>
                </form>
            </Form>
        </div>
    );
};
