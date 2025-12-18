import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const AppAuthSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = () => {
    return (
        <div className="flex-1 flex flex-col gap-10">
            <h1 className="text-text-primary">App Auth Settings</h1>
        </div>
    );
};
