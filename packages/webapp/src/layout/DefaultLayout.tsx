import { LogoInverted } from '@/assets/LogoInverted';
import { cn } from '@/utils/utils';

interface DefaultLayoutI {
    children: React.ReactNode;
    className?: string;
}

export default function DefaultLayout({ children, className }: DefaultLayoutI) {
    return (
        <div className="w-full h-full flex justify-center items-center py-22">
            {/* Card */}
            <div className="w-[485px] min-w-[385px] p-15 flex flex-col items-center gap-5 bg-bg-elevated border-border-disabled rounded">
                <LogoInverted className="size-12.5 text-text-primary" />
                <div className={cn('w-full flex flex-col items-center', className)}>{children}</div>
            </div>
        </div>
    );
}
