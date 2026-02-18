import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { ScopesInput } from '@/components-v2/ScopesInput';
import { Button } from '@/components-v2/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components-v2/ui/form';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

const formSchema = z.object({
    scopes: z.string().optional()
});

type FormData = z.infer<typeof formSchema>;

export const McpOAuthCreateForm: React.FC<{ provider: ApiProviderListItem; onSubmit?: (data: PostIntegration['Body']) => Promise<void> }> = ({
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
                    authType: provider.authMode as Extract<typeof provider.authMode, 'MCP_OAUTH2'>,
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
