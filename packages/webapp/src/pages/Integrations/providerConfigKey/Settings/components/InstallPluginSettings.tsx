import z from 'zod';

import { EditableInput } from '@/components-v2/EditableInput';
import { Label } from '@/components-v2/ui/label';
import { apiPatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';

import type { ApiEnvironment, GetIntegration, PatchIntegration, ProviderInstallPlugin } from '@nangohq/types';

export const InstallPluginSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template }
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();

    const validateUrl = (value: string): string | null => {
        if (!value) {
            return null; // Empty values are allowed (optional fields)
        }
        const result = z.string().url('Must be a valid URL (e.g., https://example.com)').safeParse(value);
        return result.success ? null : result.error.issues[0]?.message || null;
    };

    const onSave = async (field: Partial<PatchIntegration['Body']>) => {
        const updated = await apiPatchIntegration(env, integration.unique_key, {
            authType: 'INSTALL_PLUGIN',
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

    const isBasicAuth = template.auth_mode === 'INSTALL_PLUGIN' && (template as ProviderInstallPlugin).auth_type === 'BASIC';

    return (
        <div className="flex flex-col gap-10">
            {/* Install Link */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="install_link">Install Link</Label>
                <EditableInput initialValue={integration.app_link || ''} onSave={(value) => onSave({ appLink: value })} validate={validateUrl} />
            </div>

            {isBasicAuth && (
                <>
                    {/* Username */}
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="username">Username</Label>
                        <EditableInput secret initialValue={integration.custom?.['username'] || ''} onSave={(value) => onSave({ username: value } as any)} />
                    </div>

                    {/* Password */}
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="password">Password</Label>
                        <EditableInput secret initialValue={integration.custom?.['password'] || ''} onSave={(value) => onSave({ password: value } as any)} />
                    </div>
                </>
            )}
        </div>
    );
};
