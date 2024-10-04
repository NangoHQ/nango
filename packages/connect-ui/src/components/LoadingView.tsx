import { Skeleton } from './ui/skeleton';

export const LoadingView: React.FC = () => {
    return (
        <div className="w-full h-full p-9 flex flex-col gap-2 relative">
            <Skeleton className="h-6 w-[250px] mt-14 ml-20 mb-20" />

            <Skeleton className="h-[90px] w-full" />
            <Skeleton className="h-[90px] w-full" />
            <Skeleton className="h-[90px] w-full" />
            <Skeleton className="h-[90px] w-full" />
            <Skeleton className="h-[90px] w-full" />
        </div>
    );
};
