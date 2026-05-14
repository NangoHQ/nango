import { AlertTriangle } from 'lucide-react';

import { GenericApiKeyAuthPresentationForm } from '../../../components/forms/GenericApiKeyAuthPresentationForm';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';

import type { ApiEnvironment, ApiPublicGenericApiKeyConfig, GetIntegration, PatchIntegration } from '@nangohq/types';

export const GenericApiKeySettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({ data: { integration, meta } }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { confirm, DialogComponent } = useConfirmDialog();
    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);
    const initialValue = toGenericApiKeyConfig(integration.custom);

    const onSave = async (genericApiKey: ApiPublicGenericApiKeyConfig) => {
        if (meta.connectionsCount > 0 && !isSameGenericApiKeyConfig(initialValue, genericApiKey)) {
            const confirmed = await confirm({
                icon: <AlertTriangle />,
                title: 'Update Generic API Key configuration?',
                description: `This integration has ${meta.connectionsCount} active ${
                    meta.connectionsCount === 1 ? 'connection' : 'connections'
                }. Changing the base URL or API key presentation will affect future proxy requests for all of them.`,
                confirmButtonText: 'Save changes',
                confirmVariant: 'destructive',
                onConfirm: () => {}
            });
            if (!confirmed) {
                return;
            }
        }

        try {
            await patchIntegration({ generic_api_key: genericApiKey } satisfies PatchIntegration['Body']);
            toast({ title: 'Successfully updated', variant: 'success' });
        } catch (err) {
            const apiErrorMessage = getApiErrorMessage(err);
            const message = apiErrorMessage ?? 'Failed to update, an error occurred';
            if (!apiErrorMessage) {
                toast({ title: message, variant: 'error' });
            }
            throw new Error(message);
        }
    };

    return (
        <div className="flex flex-col gap-10">
            <GenericApiKeyAuthPresentationForm submitLabel="Save" initialValue={initialValue} onSubmit={onSave} />
            {DialogComponent}
        </div>
    );
};

function toGenericApiKeyConfig(custom: GetIntegration['Success']['data']['integration']['custom']): ApiPublicGenericApiKeyConfig | undefined {
    if (!custom) {
        return undefined;
    }

    const baseUrl = custom['generic_api_key_base_url'];
    const placement = custom['generic_api_key_placement'];
    const name = custom['generic_api_key_name'];
    const valueTemplate = custom['generic_api_key_value_template'];
    const verificationMethod = custom['generic_api_key_verification_method'];
    const verificationEndpoint = custom['generic_api_key_verification_endpoint'];

    if (!baseUrl || (placement !== 'header' && placement !== 'query') || !name || !valueTemplate) {
        return undefined;
    }

    return {
        base_url: baseUrl,
        placement,
        name,
        value_template: valueTemplate,
        ...(verificationEndpoint
            ? {
                  verification: {
                      ...(verificationMethod === 'GET' || verificationMethod === 'POST' ? { method: verificationMethod } : {}),
                      endpoint: verificationEndpoint
                  }
              }
            : {})
    };
}

function getApiErrorMessage(err: unknown): string | null {
    if (err instanceof APIError && err.json?.error?.message) {
        return err.json.error.message;
    }

    return null;
}

function isSameGenericApiKeyConfig(left: ApiPublicGenericApiKeyConfig | undefined, right: ApiPublicGenericApiKeyConfig): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}
