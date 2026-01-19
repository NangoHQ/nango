import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { SecretInput } from '@/components-v2/SecretInput';
import { Button } from '@/components-v2/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components-v2/ui/form';
import { InputGroup, InputGroupInput } from '@/components-v2/ui/input-group';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

const formSchema = z.object({
    appLink: z.string().url('Must be a valid URL (e.g., https://example.com)').optional(),
    username: z.string().optional(),
    password: z.string().optional()
});

type FormData = z.infer<typeof formSchema>;

export const InstallPluginAuthCreateForm: React.FC<{ provider: ApiProviderListItem; onSubmit?: (data: PostIntegration['Body']) => Promise<void> }> = ({
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
                    authType: provider.authMode as Extract<typeof provider.authMode, 'INSTALL_PLUGIN'>,
                    appLink: formData.appLink,
                    username: formData.username,
                    password: formData.password
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
                            name="appLink"
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <FormLabel>Install Link</FormLabel>
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
                            name="username"
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <FormLabel>Username</FormLabel>
                                    <FormControl>
                                        <InputGroup>
                                            <SecretInput {...field} aria-invalid={!!fieldState.error} />
                                        </InputGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <FormLabel>Password</FormLabel>
                                    <FormControl>
                                        <InputGroup>
                                            <SecretInput {...field} aria-invalid={!!fieldState.error} />
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
