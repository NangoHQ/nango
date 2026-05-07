import { Navigate, useParams, useSearchParams } from 'react-router-dom';

import { ConnectionRecordTable } from './components/RecordsTab';
import { CriticalErrorAlert } from '@/components-v2/CriticalErrorAlert';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { useConnectionRecordModels } from '@/hooks/useRecords';
import { useConnectionContext } from '@/pages/Connection/Show';
import { ConnectionTabLayout } from '@/pages/Connection/components/ConnectionTabLayout';
import { useStore } from '@/store';

export const ShowRecordModel = () => {
    const env = useStore((state) => state.env);
    const { model } = useParams();
    const [searchParams] = useSearchParams();
    const variant = searchParams.get('variant');
    const { connectionData, providerConfigKey } = useConnectionContext();

    const {
        data: models,
        isLoading: isModelsLoading,
        error: modelsError
    } = useConnectionRecordModels({ env, provider_config_key: providerConfigKey }, { connectionId: connectionData.connection.connection_id });

    if (modelsError) {
        return <CriticalErrorAlert message="Failed to load record models" />;
    }

    if (isModelsLoading) {
        return <Skeleton className="h-72 w-full max-w-4xl" />;
    }

    const activeModel = models?.find((m) => m.model === model && (m.variant || null) === (variant || null));

    if (!activeModel) {
        return <Navigate to=".." replace />;
    }

    return (
        <ConnectionTabLayout connectionData={connectionData}>
            <div className="w-full min-w-0 max-w-4xl">
                <ConnectionRecordTable
                    connectionId={connectionData.connection.connection_id}
                    env={env}
                    model={activeModel}
                    providerConfigKey={providerConfigKey}
                />
            </div>
        </ConnectionTabLayout>
    );
};
