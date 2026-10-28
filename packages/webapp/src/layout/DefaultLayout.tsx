import { LogoInverted } from '@/assets/LogoInverted';
import { cn } from '@/utils/utils';

interface DefaultLayoutI {
    children: React.ReactNode;
    className?: string;
    wide?: boolean;
}

export default function DefaultLayout({ children, className, wide = false }: DefaultLayoutI) {
    return (
        <div className="w-full h-full flex justify-center items-center bg-surface-canvas py-22">
            {/* Card */}
            <div
                className={cn(
                    'flex flex-col items-center gap-5 bg-surface-page border-border-disabled rounded',
                    wide ? 'w-[821px] max-w-full px-6 py-10 sm:px-30 sm:py-20' : 'w-[485px] min-w-[385px] p-15'
                )}
            >
                <LogoInverted className="size-12.5 text-text-strong" />
                <div className={cn('w-full flex flex-col items-center', className)}>{children}</div>
            </div>
        </div>
    );
}
