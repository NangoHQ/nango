import { CopyButton } from '@/components-v2/CopyButton';
import { EditableInput } from '@/components-v2/EditableInput';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Label } from '@/components-v2/ui/label';
import { apiPatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { validateUrl } from '@/pages/Integrations/utils';
import { useStore } from '@/store';
import { defaultCallback } from '@/utils/utils';

import type { ApiEnvironment, GetIntegration, PatchIntegration } from '@nangohq/types';

export const McpGenericSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();

    const callbackUrl = environment.callback_url || defaultCallback();

    const onSave = async (field: Partial<PatchIntegration['Body']>) => {
        const updated = await apiPatchIntegration(env, integration.unique_key, {
            authType: template.auth_mode as Extract<typeof template.auth_mode, 'MCP_OAUTH2_GENERIC'>,
            ...field
        } as any);
        if ('error' in updated.json) {
            const errorMessage = updated.json.error.message || 'Failed to update, an error occurred';
            toast({ title: errorMessage, variant: 'error' });
            throw new Error(errorMessage);
        } else {
            toast({ title: 'Successfully updated', variant: 'success' });
        }
    };

    return (
        <div className="flex flex-col gap-10">
            {/* Callback URL */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="callback_url">Callback URL</Label>
                <InputGroup>
                    <InputGroupInput disabled value={callbackUrl} />
                    <InputGroupAddon align="inline-end">
                        <CopyButton text={callbackUrl} />
                    </InputGroupAddon>
                </InputGroup>
            </div>

            {/* OAuth Client Name */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="client_name">OAuth Client Name</Label>
                <EditableInput
                    initialValue={integration.custom?.oauth_client_name || ''}
                    onSave={(value) => onSave({ clientName: value })}
                    placeholder="e.g., My Application"
                />
            </div>

            {/* OAuth Client URI */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="client_uri">OAuth Client URI</Label>
                <EditableInput
                    initialValue={integration.custom?.oauth_client_uri || ''}
                    onSave={(value) => onSave({ clientUri: value })}
                    placeholder="e.g., https://example.com"
                    validate={validateUrl}
                />
            </div>

            {/* OAuth Client Logo URI */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="client_logo_uri">OAuth Client Logo URI</Label>
                <EditableInput
                    initialValue={integration.custom?.oauth_client_logo_uri || ''}
                    onSave={(value) => onSave({ clientLogoUri: value })}
                    placeholder="e.g., https://example.com/logo.png"
                    validate={validateUrl}
                />
            </div>
        </div>
    );
};
