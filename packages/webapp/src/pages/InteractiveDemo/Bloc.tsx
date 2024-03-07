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
        <div className="ml-12">
            <div
                className={cn(
                    'p-5 rounded-lg relative border border-zinc-500',
                    !active && !done && 'border-zinc-800',
                    done && 'border border-emerald-300 bg-gradient-to-r from-emerald-300/20 from-20% to-black to-50%'
                )}
            >
                {!noTrack && (
                    <div className={cn('absolute left-[-2.3rem] top-12 border-l border-zinc-800 h-[calc(100%+2rem)]', done && 'border-emerald-300')}></div>
                )}
                <div className="absolute left-[-3rem] top-6 w-6 h-6 rounded-full ring-black bg-[#0e1014] flex items-center justify-center">
                    <div className={cn('rounded-full ring-1 py-1 px-1', done ? 'ring-emerald-300' : 'ring-white', active && 'bg-white')}>
                        <Logo fill={done ? '#6ee7b7' : active ? 'black' : 'white'} size={12} />
                    </div>
                </div>
                <h2 className={cn('text-xl font-semibold leading-7 text-zinc-500', (active || done) && 'text-white')}>{title}</h2>
                <h3 className="text-zinc-400 text-sm">{subtitle}</h3>

                {(active || done) && <div className="mt-6">{children}</div>}
            </div>
        </div>
    );
};

export const Tab: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <Button type="button" variant="black" size="sm" className="cursor-default bg-zinc-800 pointer-events-none text-zinc-200 px-1.5 !py-0.5 !h-6">
            {children}
        </Button>
    );
};
