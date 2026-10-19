import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';

export type PlaygroundTab = 'agent' | 'functions';

export function usePlaygroundTabs(): { ready: boolean; tabs: PlaygroundTab[] } {
    const { data: meta } = useMeta();
    const { can } = usePermissions();

    if (!meta) {
        return { ready: false, tabs: [] };
    }

    const tabs: PlaygroundTab[] = [];
    if (meta.data.agentPlayground && can('environment:agent_sessions:write')) {
        tabs.push('agent');
    }
    if (can('environment:syncs:execute')) {
        tabs.push('functions');
    }
    return { ready: true, tabs };
}
