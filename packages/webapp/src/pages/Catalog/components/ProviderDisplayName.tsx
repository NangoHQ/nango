import { useProvider } from '@/hooks/useProvider';
import { useStore } from '@/store';

export const ProviderDisplayName = ({ provider }: { provider: string | undefined }) => {
    const env = useStore((state) => state.env);
    const { data } = useProvider(env, provider);

    return <>{data?.data.displayName ?? provider}</>;
};
