import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { InfoTooltip } from '../../providerConfigKey/Settings/components/InfoTooltip';
import { SecretInput } from '@/components-v2/SecretInput';
import { Button } from '@/components-v2/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components-v2/ui/form';
import { InputGroup, InputGroupInput, InputGroupTextarea } from '@/components-v2/ui/input-group';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

const formSchema = z.object({
    appId: z.string().optional(),
    appLink: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    privateKey: z.string().startsWith('-----BEGIN RSA PRIVATE KEY-----').endsWith('-----END RSA PRIVATE KEY-----').optional()
});

type FormData = z.infer<typeof formSchema>;

export const CustomAuthCreateForm: React.FC<{ provider: ApiProviderListItem; onSubmit?: (data: PostIntegration['Body']) => Promise<void> }> = ({
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
                    authType: provider.authMode as Extract<typeof provider.authMode, 'CUSTOM'>,
                    appId: formData.appId,
                    appLink: formData.appLink,
                    clientId: formData.clientId,
                    clientSecret: formData.clientSecret,
                    privateKey: formData.privateKey
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
                            name="appId"
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <div className="flex gap-2 items-center">
                                        <FormLabel>App ID</FormLabel>
                                        <InfoTooltip>Obtain the app id from the app page.</InfoTooltip>
                                    </div>
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
                            name="appLink"
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <div className="flex gap-2 items-center">
                                        <FormLabel>App public link</FormLabel>
                                        <InfoTooltip>Obtain the app public link from the app page.</InfoTooltip>
                                    </div>
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
                            name="clientId"
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <FormLabel>Client ID</FormLabel>
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
                            name="clientSecret"
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <FormLabel>Client Secret</FormLabel>
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
                            name="privateKey"
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <div className="flex gap-2 items-center">
                                        <FormLabel>App private key</FormLabel>
                                        <InfoTooltip>
                                            Obtain the app private key from the app page by downloading the private key and pasting the entirety of its contents
                                            here.
                                        </InfoTooltip>
                                    </div>
                                    <FormControl>
                                        <InputGroup>
                                            <InputGroupTextarea {...field} aria-invalid={!!fieldState.error} />
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
