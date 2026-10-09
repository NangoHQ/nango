import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription, InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { EditableInput } from '@/components/patterns/EditableInput';
import { CopyButton } from '@/components/ui/CopyButton';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { validateNotEmpty, validateUrl } from '@/pages/Integrations/utils';
import { useStore } from '@/store';
import { defaultCallback } from '@/utils/cloud.js';
import { AppPrivateKeyInput } from './AppPrivateKeyInput';
import { SettingsField } from './SettingsLayout';

import type { ApiEnvironment, GetIntegration, PatchIntegration } from '@nangohq/types';

export const CustomAuthSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { confirm, DialogComponent } = useConfirmDialog();
    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);
    const [isEditingClientId, setIsEditingClientId] = useState(false);

    const callbackUrl = environment.callback_url || defaultCallback();
    const hasExistingClientId = Boolean(integration.oauth_client_id);

    const onSave = async (field: Partial<PatchIntegration['Body']>, supressToast = false) => {
        try {
            await patchIntegration({ authType: 'CUSTOM', ...field } as PatchIntegration['Body']);
            if (!supressToast) {
                toast({ title: 'Successfully updated', variant: 'success' });
            }
        } catch {
            const message = 'Failed to update, an error occurred';
            if (!supressToast) {
                toast({ title: message, variant: 'error' });
            }
            throw new Error(message);
        }
    };

    const handleClientIdSave = async (value: string) => {
        // If there is no existing client ID, there's no risk in saving directly
        if (!hasExistingClientId) {
            await onSave({ clientId: value });
            return;
        }

        const confirmed = await confirm({
            icon: <AlertTriangle />,
            title: 'Confirm Client ID update',
            description:
                'Updating the Client ID will invalidate token refreshes for all existing connections for this integration. Are you sure you want to continue?',
            confirmButtonText: 'Update Client ID',
            confirmVariant: 'danger',
            onConfirm: async () => {
                await onSave({ clientId: value });
            }
        });

        // If user cancelled, throw error to keep EditableInput in edit mode
        if (!confirmed) {
            throw new Error('Cancelled');
        }
    };

    return (
        <>
            <div className="flex flex-col gap-6">
                <SettingsField label="Callback URL" htmlFor="callback_url">
                    <InputGroup>
                        <InputGroupInput disabled value={callbackUrl} />
                        <InputGroupAddon align="inline-end">
                            <CopyButton text={callbackUrl} />
                        </InputGroupAddon>
                    </InputGroup>
                </SettingsField>

                <SettingsField label="App ID" htmlFor="app_id" info={<InfoTooltip size="sm">Obtain the app id from the app page.</InfoTooltip>}>
                    <EditableInput initialValue={integration.custom?.app_id || ''} onSave={(value) => onSave({ appId: value })} validate={validateNotEmpty} />
                </SettingsField>

                <SettingsField
                    label="App public link"
                    htmlFor="app_link"
                    info={<InfoTooltip size="sm">Obtain the app public link from the app page.</InfoTooltip>}
                >
                    <EditableInput initialValue={integration.app_link || ''} onSave={(value) => onSave({ appLink: value })} validate={validateUrl} />
                </SettingsField>

                <SettingsField label="Client ID" htmlFor="client_id">
                    <EditableInput
                        initialValue={integration.oauth_client_id || ''}
                        onSave={handleClientIdSave}
                        onEditingChange={setIsEditingClientId}
                        validate={validateNotEmpty}
                    />
                    {isEditingClientId && hasExistingClientId && (
                        <Alert variant="warning">
                            <AlertTriangle />
                            <AlertDescription>
                                Updating the Client ID will invalidate token refreshes for all existing connections for this integration.
                            </AlertDescription>
                        </Alert>
                    )}
                </SettingsField>

                <SettingsField label="Client secret" htmlFor="client_secret">
                    <EditableInput
                        secret
                        initialValue={integration.oauth_client_secret || ''}
                        onSave={(value) => onSave({ clientSecret: value })}
                        validate={validateNotEmpty}
                    />
                </SettingsField>

                <AppPrivateKeyInput initialValue={integration.custom?.private_key || ''} onSave={(value) => onSave({ privateKey: value })} />
            </div>
            {DialogComponent}
        </>
    );
};
