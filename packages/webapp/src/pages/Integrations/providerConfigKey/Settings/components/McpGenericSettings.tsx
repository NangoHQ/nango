import { InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { EditableInput } from '@/components/patterns/EditableInput';
import { ScopesInput } from '@/components/patterns/ScopesInput';
import { CopyButton } from '@/components/ui/CopyButton';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { validateNotEmpty, validateUrl } from '@/pages/Integrations/utils';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';
import { defaultCallback } from '@/utils/cloud';
import { SettingsField } from './SettingsLayout';

import type { ApiEnvironment, GetIntegration, PatchIntegration } from '@nangohq/types';

export const McpGenericSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { can } = usePermissions();
    const canEdit = can('environment:integrations:update', environment);
    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);

    const callbackUrl = environment.callback_url || defaultCallback();

    const onSave = async (field: Partial<PatchIntegration['Body']>) => {
        try {
            await patchIntegration({
                authType: template.auth_mode,
                ...field
            } as PatchIntegration['Body']);
            toast({ title: 'Successfully updated', variant: 'success' });
        } catch {
            const message = 'Failed to update, an error occurred';
            toast({ title: message, variant: 'error' });
            throw new Error(message);
        }
    };

    const handleScopesChange = async (scopes: string, countDifference: number) => {
        try {
            await patchIntegration({
                authType: template.auth_mode,
                scopes
            } as PatchIntegration['Body']);
            if (countDifference > 0) {
                const plural = countDifference > 1 ? 'scopes' : 'scope';
                toast({ title: `Added ${countDifference} new ${plural}`, variant: 'success' });
            } else {
                const plural = countDifference < -1 ? 'Scopes' : 'Scope';
                toast({ title: `${plural} successfully removed`, variant: 'success' });
            }
        } catch (err) {
            let errorMessage = 'Failed to update scopes';
            if (err instanceof APIError && err.json.error.message) {
                errorMessage = err.json.error.message;
            }
            toast({ title: errorMessage, variant: 'error' });
            throw new Error(errorMessage);
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

            <SettingsField label="OAuth client name" htmlFor="client_name">
                <EditableInput
                    initialValue={integration.custom?.oauth_client_name || ''}
                    onSave={(value) => onSave({ clientName: value })}
                    validate={validateNotEmpty}
                    canEdit={canEdit}
                />
            </SettingsField>

            <SettingsField label="OAuth client URI" htmlFor="client_uri">
                <EditableInput
                    initialValue={integration.custom?.oauth_client_uri || ''}
                    onSave={(value) => onSave({ clientUri: value })}
                    validate={validateNotEmpty}
                    canEdit={canEdit}
                />
            </SettingsField>

            <SettingsField label="OAuth client logo URI" htmlFor="client_logo_uri">
                <EditableInput
                    initialValue={integration.custom?.oauth_client_logo_uri || ''}
                    onSave={(value) => onSave({ clientLogoUri: value })}
                    placeholder="e.g., https://example.com/logo.png"
                    validate={validateUrl}
                    canEdit={canEdit}
                />
            </SettingsField>

            <SettingsField label="Scopes" htmlFor="scopes">
                <ScopesInput scopesString={integration.oauth_scopes || ''} onChange={handleScopesChange} readOnly={!canEdit} />
            </SettingsField>
        </div>
    );
};
