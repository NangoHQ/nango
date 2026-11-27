import { Skeleton } from '@/components/ui/Skeleton';
import { useProvider } from '@/hooks/useProvider';
import { useStore } from '@/store';

export const ProviderBreadcrumb: React.FC<{ provider: string }> = ({ provider }) => {
    const env = useStore((state) => state.env);
    const { data, isPending } = useProvider(env, provider);

    if (isPending) {
        return <Skeleton className="inline-block w-16 align-middle" />;
    }

    return data?.data.displayName ?? provider;
};
