import { Skeleton } from './ui/skeleton';
import { useI18n } from '@/lib/i18n';

export const LoadingView: React.FC = () => {
    const { t } = useI18n();

    return (
        <div aria-label={t('common.loading')} className="w-full h-full p-9 flex flex-col gap-2 relative bg-background">
            <Skeleton className="h-6 w-[250px] mt-14 ml-20 mb-20 bg-surface" />

            <Skeleton className="h-[90px] w-full bg-surface" />
            <Skeleton className="h-[90px] w-full bg-surface" />
            <Skeleton className="h-[90px] w-full bg-surface" />
            <Skeleton className="h-[90px] w-full bg-surface" />
            <Skeleton className="h-[90px] w-full bg-surface" />
        </div>
    );
};
