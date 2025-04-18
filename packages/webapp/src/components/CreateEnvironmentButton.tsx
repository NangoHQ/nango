import { IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { SimpleTooltip } from './SimpleTooltip';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle, DialogTrigger } from './ui/Dialog';
import { apiPostEnvironment, useEnvironment } from '../hooks/useEnvironment';
import { useMeta } from '../hooks/useMeta';
import { useToast } from '../hooks/useToast';
import { useStore } from '../store';
import { cn } from '../utils/utils';
import { Button } from './ui/button/Button';
import { Input } from './ui/input/Input';

export const CreateEnvironmentButton: React.FC = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { mutate: mutateMeta } = useMeta();
    const env = useStore((state) => state.env);
    const envs = useStore((state) => state.envs);
    const environment = useEnvironment(env);

    const [openDialog, setOpenDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [name, setName] = useState('');

    const onCreate = async () => {
        setLoading(true);

        const res = await apiPostEnvironment({ name });
        if ('error' in res.json) {
            const err = res.json.error;
            if (err.code === 'invalid_body') {
                setError(true);
            } else if (['conflict', 'feature_disabled', 'resource_capped'].includes(err.code)) {
                toast({ title: err.message, variant: 'error' });
            } else {
                toast({ title: 'Failed to create environment', variant: 'error' });
            }
        } else {
            navigate(`/${res.json.data.name}`);
            setOpenDialog(false);
            setError(false);
            setName('');
            void mutateMeta();
        }

        setLoading(false);
    };

    const isMaxEnvironmentsReached = envs && environment.plan && envs.length >= environment.plan.environments_max;
    let tooltipContent: React.ReactNode = null;
    if (isMaxEnvironmentsReached) {
        tooltipContent = (
            <span>
                Max number of environments reached.{' '}
                {environment?.plan?.name === 'scale' ? (
                    <>Contact Nango to add more</>
                ) : (
                    <>
                        <Link to="https://app.withsurface.com/s/cm1zve3340001l503sm0xtvo1" className="underline">
                            Upgrade
                        </Link>{' '}
                        to add more
                    </>
                )}
            </span>
        );
    }

    return (
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <SimpleTooltip tooltipContent={tooltipContent} delay={0} className="text-gray-400" side="bottom">
                <DialogTrigger className="w-full" asChild>
                    <Button disabled={!!isMaxEnvironmentsReached} variant={'secondary'} className="w-full justify-center">
                        {isMaxEnvironmentsReached && <IconLock size={18} stroke={1} />}
                        Create environment
                    </Button>
                </DialogTrigger>
            </SimpleTooltip>
            <DialogContent className="w-[550px]">
                <DialogTitle>Environment Name</DialogTitle>
                <div>
                    <Input
                        placeholder="my-environment-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        variant={'black'}
                        onKeyUp={(e) => e.code === 'Enter' && onCreate()}
                    />
                    <div className={cn('text-xs text-grayscale-500', error && 'text-alert-400')}>
                        *Must be lowercase letters, numbers, underscores and dashes.
                    </div>
                </div>
                <DialogFooter className="mt-4">
                    <DialogClose asChild>
                        <Button variant="zinc">Cancel</Button>
                    </DialogClose>
                    <Button variant="primary" onClick={onCreate} isLoading={loading} type="submit">
                        Create environment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
