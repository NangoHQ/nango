import { HeaderButtons } from './HeaderButtons';
import { Skeleton } from './ui/skeleton';
import { useI18n } from '@/lib/i18n';

export const LoadingView: React.FC = () => {
    const { t } = useI18n();

    return (
        <div aria-label={t('common.loading')} className="w-full h-full">
            <HeaderButtons />
            <div className="space-y-5">
                <Skeleton className="h-6 w-2/3 mx-auto" />
                <Skeleton className="h-5 w-full" />
                <div className="space-y-2">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                </div>
            </div>
        </div>
    );
};
