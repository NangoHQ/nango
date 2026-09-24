import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@nangohq/design-system';

import { Form } from '@/components/ui/Form';
import {
    buildIntegrationConfigSchema,
    filterVisibleIntegrationConfig,
    IntegrationConfigFormFields,
    useIntegrationConfigFormPieces
} from './IntegrationConfigFields';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

/**
 * Renders the custom integration configuration form from a provider's `integration_config`
 * (e.g. the `private-api-generic` API-key provider). Submitted values are persisted to the
 * integration's `custom` field server-side.
 */
export const CustomIntegrationCreateForm: React.FC<{
    provider: ApiProviderListItem;
    onSubmit?: (data: PostIntegration['Body']) => Promise<void>;
}> = ({ provider, onSubmit }) => {
    const { fields, schemaMap, defaultValues } = useIntegrationConfigFormPieces(provider.integration_config);
    const schema = useMemo(() => buildIntegrationConfigSchema(fields, schemaMap), [fields, schemaMap]);

    const form = useForm({ resolver: zodResolver(schema), defaultValues });

    const [loading, setLoading] = useState(false);

    const onSubmitForm = async (formData: Record<string, string | undefined>) => {
        setLoading(true);
        try {
            await onSubmit?.({
                provider: provider.name,
                useSharedCredentials: false,
                integrationConfig: filterVisibleIntegrationConfig(formData, schemaMap)
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
                        <IntegrationConfigFormFields control={form.control} fields={fields} schemaMap={schemaMap} watched={watched} />
                    </div>

                    <div>
                        <Button type="submit" loading={loading}>
                            Create
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
};
