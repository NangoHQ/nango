import { FieldLabel, InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { EditableInput } from '@/components/patterns/EditableInput';
import { CopyButton } from '@/components/ui/CopyButton';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { validateNotEmpty, validateUrl } from '@/pages/Integrations/utils';
import { useStore } from '@/store';
import { defaultCallback } from '@/utils/cloud';

import type { ApiEnvironment, GetIntegration, PatchIntegration } from '@nangohq/types';

export const McpGenericSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
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

    return (
        <div className="flex flex-col gap-10">
            {/* Callback URL */}
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="callback_url">Callback URL</FieldLabel>
                <InputGroup>
                    <InputGroupInput disabled value={callbackUrl} />
                    <InputGroupAddon align="inline-end">
                        <CopyButton text={callbackUrl} />
                    </InputGroupAddon>
                </InputGroup>
            </div>

            {/* OAuth Client Name */}
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="client_name">OAuth Client Name</FieldLabel>
                <EditableInput
                    initialValue={integration.custom?.oauth_client_name || ''}
                    onSave={(value) => onSave({ clientName: value })}
                    validate={validateNotEmpty}
                />
            </div>

            {/* OAuth Client URI */}
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="client_uri">OAuth Client URI</FieldLabel>
                <EditableInput
                    initialValue={integration.custom?.oauth_client_uri || ''}
                    onSave={(value) => onSave({ clientUri: value })}
                    validate={validateNotEmpty}
                />
            </div>

            {/* OAuth Client Logo URI */}
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="client_logo_uri">OAuth Client Logo URI</FieldLabel>
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
