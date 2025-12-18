import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const OAuthSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = () => {
    return (
        <div className="flex-1 flex flex-col gap-10">
            <h1 className="text-text-primary">OAuth Settings</h1>
        </div>
    );
};
