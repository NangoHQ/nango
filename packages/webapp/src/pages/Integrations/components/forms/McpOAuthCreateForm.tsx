import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { ScopesInput } from '@/components-v2/ScopesInput';
import { SecretInput } from '@/components-v2/SecretInput';
import { Button } from '@/components-v2/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components-v2/ui/form';
import { InputGroupInput } from '@/components-v2/ui/input-group';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

const formSchema = z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    scopes: z.string().optional()
});

type FormData = z.infer<typeof formSchema>;

export const McpOAuthCreateForm: React.FC<{ provider: ApiProviderListItem; onSubmit?: (data: PostIntegration['Body']) => Promise<void> }> = ({
    provider,
    onSubmit
}) => {
    const useUserCredentials = provider.clientRegistration === 'static';

    const form = useForm({
        resolver: zodResolver(formSchema)
    });

    const [loading, setLoading] = useState(false);

    const onSubmitForm = async (formData: FormData) => {
        if (useUserCredentials) {
            if (!formData.clientId?.trim()) {
                form.setError('clientId', { message: 'Client ID is required' });
                return;
            }
            if (!formData.clientSecret) {
                form.setError('clientSecret', { message: 'Client Secret is required' });
                return;
            }
        }
        setLoading(true);
        try {
            await onSubmit?.({
                provider: provider.name,
                useSharedCredentials: false,
                auth: {
                    authType: provider.authMode as Extract<typeof provider.authMode, 'MCP_OAUTH2'>,
                    ...(useUserCredentials && formData.clientId && { clientId: formData.clientId.trim() }),
                    ...(useUserCredentials && formData.clientSecret && { clientSecret: formData.clientSecret }),
                    scopes: formData.scopes
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
                        {useUserCredentials && (
                            <>
                                <FormField
                                    control={form.control}
                                    name="clientId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Client ID</FormLabel>
                                            <FormControl>
                                                <InputGroupInput {...field} placeholder="Enter your OAuth Client ID" value={field.value ?? ''} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="clientSecret"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Client Secret</FormLabel>
                                            <FormControl>
                                                <SecretInput {...field} value={field.value ?? ''} placeholder="Enter your OAuth Client Secret" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </>
                        )}
                        <FormField
                            control={form.control}
                            name="scopes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Scopes</FormLabel>
                                    <FormControl>
                                        <ScopesInput scopesString={field.value} onChange={(scopes) => Promise.resolve(field.onChange(scopes))} />
                                    </FormControl>
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
