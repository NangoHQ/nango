import { useConnectionsCount } from '@/hooks/useConnections';
import { useListIntegrations } from '@/hooks/useIntegration';

const SUFFIX = 'including synced records, API keys and logs. Apps using its API keys stop working right away.';

function plural(count: number, noun: string): string {
    return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
}

export const EnvironmentDeleteDescription: React.FC<{ env: string }> = ({ env }) => {
    const { data: integrations } = useListIntegrations(env);
    const { data: connections, isPlaceholderData } = useConnectionsCount(env);

    const integrationCount = integrations?.data.length;
    const connectionCount = isPlaceholderData ? undefined : connections?.data.total;

    if (integrationCount === undefined || connectionCount === undefined) {
        return <>This permanently deletes everything in it, {SUFFIX}</>;
    }

    return (
        <>
            This permanently deletes <strong className="font-ds-medium text-text-default">{plural(integrationCount, 'integration')}</strong>,{' '}
            <strong className="font-ds-medium text-text-default">{plural(connectionCount, 'connection')}</strong> and everything else in it, {SUFFIX}
        </>
    );
};
