import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';

export function useCanUseAgentPlayground(): boolean {
    const { data: meta } = useMeta();
    const { can } = usePermissions();
    return Boolean(meta?.data.agentPlayground) && can('environment:agent_sessions:write');
}
