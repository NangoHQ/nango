import { SecretInput } from '@/components-v2/SecretInput';
import { Label } from '@/components-v2/ui/label';

import type { ApiKeyCredentials } from '@nangohq/types';

export const ApiKeyCredentialsComponent: React.FC<{
    credentials: ApiKeyCredentials;
}> = ({ credentials }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <Label htmlFor="api_key">API key</Label>
                <SecretInput id="api_key" value={credentials.apiKey} disabled copy />
            </div>
        </>
    );
};
