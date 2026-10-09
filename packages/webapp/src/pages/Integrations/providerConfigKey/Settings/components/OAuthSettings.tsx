import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription, InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { EditableInput } from '@/components/patterns/EditableInput';
import { ScopesInput } from '@/components/patterns/ScopesInput';
import { CopyButton } from '@/components/ui/CopyButton';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { NangoProvidedInput } from '@/pages/Integrations/components/NangoProvidedInput';
import { validateNotEmpty } from '@/pages/Integrations/utils';
import { useStore } from '@/store';
import { defaultCallback } from '@/utils/cloud';
import { SettingsField } from './SettingsLayout';

import type { ApiEnvironment, GetIntegration, PatchIntegration } from '@nangohq/types';

export const OAuthSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { confirm, DialogComponent } = useConfirmDialog();

    const { can } = usePermissions();
    const canEdit = can('environment:integrations:update', environment);

    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);
    const [isEditingClientId, setIsEditingClientId] = useState(false);

    const callbackUrl = environment.callback_url || defaultCallback();
    const hasExistingClientId = Boolean(integration.oauth_client_id);
    const isSharedCredentials = Boolean(integration.shared_credentials_id);

    const onSave = async (field: Partial<PatchIntegration['Body']>, supressToast = false) => {
        try {
            await patchIntegration({
                authType: template.auth_mode as Extract<typeof template.auth_mode, 'OAUTH1' | 'OAUTH2' | 'TBA'>,
                ...field
            });
            if (!supressToast) {
                toast({ title: 'Successfully updated', variant: 'success' });
            }
        } catch {
            const message = 'Failed to update, an error occurred';
            toast({ title: message, variant: 'error' });
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

    const handleScopesChange = async (scopes: string, countDifference: number) => {
        try {
            await onSave({ scopes }, true);

            if (countDifference > 0) {
                const plural = countDifference > 1 ? 'scopes' : 'scope';
                toast({ title: `Added ${countDifference} new ${plural}`, variant: 'success' });
            } else {
                toast({ title: `Scope successfully removed`, variant: 'success' });
            }
        } catch (err) {
            toast({ title: 'Failed to update scopes', variant: 'error' });
            throw err;
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <SettingsField label="Callback URL" htmlFor="callback_url">
                <InputGroup>
                    <InputGroupInput disabled value={callbackUrl} />
                    <InputGroupAddon align="inline-end">
                        <CopyButton text={callbackUrl} />
                    </InputGroupAddon>
                </InputGroup>
            </SettingsField>

            <SettingsField label="Client ID" htmlFor="client_id">
                {isSharedCredentials ? (
                    <NangoProvidedInput fakeValueSize={24} />
                ) : (
                    <>
                        <EditableInput
                            initialValue={integration.oauth_client_id || ''}
                            onSave={handleClientIdSave}
                            onEditingChange={setIsEditingClientId}
                            validate={validateNotEmpty}
                            canEdit={canEdit}
                            canRead={canEdit}
                            secret={!canEdit}
                        />
                        {isEditingClientId && hasExistingClientId && (
                            <Alert variant="warning">
                                <AlertTriangle />
                                <AlertDescription>
                                    Updating the Client ID will invalidate token refreshes for all existing connections for this integration.
                                </AlertDescription>
                            </Alert>
                        )}
                    </>
                )}
            </SettingsField>

            <SettingsField label="Client secret" htmlFor="client_secret">
                {isSharedCredentials ? (
                    <NangoProvidedInput fakeValueSize={48} />
                ) : (
                    <EditableInput
                        secret
                        initialValue={integration.oauth_client_secret || ''}
                        onSave={(value) => onSave({ clientSecret: value })}
                        validate={validateNotEmpty}
                        canEdit={canEdit}
                        canRead={canEdit}
                    />
                )}
            </SettingsField>

            {template.auth_mode !== 'TBA' && template.installation !== 'outbound' && (
                <SettingsField label="Scopes" htmlFor="scopes">
                    <ScopesInput
                        scopesString={integration.oauth_scopes || ''}
                        onChange={handleScopesChange}
                        isSharedCredentials={isSharedCredentials}
                        readOnly={!canEdit}
                        availableScopes={template.available_scopes}
                        showAvailableScopesDropdown={true}
                    />
                </SettingsField>
            )}

            {DialogComponent}
        </div>
    );
};
