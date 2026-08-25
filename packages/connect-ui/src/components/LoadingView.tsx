import { useI18n } from '@/lib/i18n';
import { HeaderButtons } from './HeaderButtons';
import { Skeleton } from './ui/skeleton';

export const LoadingView: React.FC = () => {
    const { t } = useI18n();

    return (
        <div aria-label={t('common.loading')} className="flex-1" role="status">
            <HeaderButtons className="mb-5" />
            <div className="flex flex-col gap-7">
                <Skeleton className="h-6 w-2/3 mx-auto" />
                <Skeleton className="h-5 w-full" />
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-[88px] w-full" />
                    <Skeleton className="h-[88px] w-full" />
                    <Skeleton className="h-[88px] w-full" />
                    <Skeleton className="h-[88px] w-full" />
                </div>
            </div>
        </div>
    );
};
