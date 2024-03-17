import { Logo } from '../../components/Logo';
import Button from '../../components/ui/button/Button';
import { cn } from '../../utils/utils';

export const Bloc: React.FC<{ active: boolean; done: boolean; title: string; subtitle: React.ReactElement; children: React.ReactNode; noTrack?: boolean }> = ({
    active,
    done,
    title,
    subtitle,
    noTrack,
    children
}) => {
    return (
        <div className="ml-14">
            <div
                className={cn(
                    'p-5 rounded-lg relative border border-zinc-800',
                    !active && !done && 'border-zinc-900',
                    done && 'border-black bg-gradient-to-r from-emerald-300/20 from-20% to-black to-50%'
                )}
            >
                {!noTrack && (
                    <div className={cn('absolute left-[-2.6rem] top-[50px] border-l border-zinc-500 h-[calc(100%+6px)]', done && 'border-emerald-300')}></div>
                )}
                <div className="absolute left-[-3.3rem] top-6 w-6 h-6 rounded-full ring-black bg-[#0e1014] flex items-center justify-center">
                    <div className={cn('rounded-full py-1.5 px-1.5 ', done ? 'bg-emerald-300 ' : active ? 'bg-white' : 'bg-zinc-900')}>
                        <Logo fill={done || active ? 'black' : '#71717A'} size={18} />
                    </div>
                </div>
                <h2 className={cn('text-xl font-semibold leading-6 text-zinc-500 mb-1', (active || done) && 'text-white')}>{title}</h2>
                <h3 className="text-zinc-400 text-sm">{subtitle}</h3>

                {(active || done) && <div className="mt-6">{children}</div>}
            </div>
        </div>
    );
};

export const Tab: React.FC<{ children: React.ReactNode } & React.ComponentProps<typeof Button>> = ({ children, className, ...props }) => {
    return (
        <Button
            type="button"
            variant="black"
            size="sm"
            className={cn('cursor-default bg-zinc-800 pointer-events-none text-zinc-200 px-1.5 !py-0.5 !h-6', className)}
            {...props}
        >
            {children}
        </Button>
    );
};
