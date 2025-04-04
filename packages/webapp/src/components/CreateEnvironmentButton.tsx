import { IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { SimpleTooltip } from './SimpleTooltip';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle, DialogTrigger } from './ui/Dialog';
import { apiPostEnvironment } from '../hooks/useEnvironment';
import { useMeta } from '../hooks/useMeta';
import { useToast } from '../hooks/useToast';
import { cn } from '../utils/utils';
import { Button } from './ui/button/Button';
import { Input } from './ui/input/Input';

export const CreateEnvironmentButton: React.FC = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { meta, mutate } = useMeta();

    const [openDialog, setOpenDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [name, setName] = useState('');

    const onCreate = async () => {
        setLoading(true);

        const res = await apiPostEnvironment({ name });
        if ('error' in res.json) {
            const err = res.json.error;
            if (err.code === 'conflict') {
                toast({ title: 'Environment name already exists', variant: 'error' });
            } else if (err.code === 'invalid_body') {
                setError(true);
            } else if (err.code === 'feature_disabled' || err.code === 'resource_capped') {
                toast({ title: err.message, variant: 'error' });
            } else {
                toast({ title: 'Failed to create environment', variant: 'error' });
            }
        } else {
            navigate(`/${res.json.data.name}`);
            setOpenDialog(false);
            setError(false);
            setName('');
            void mutate();
        }

        setLoading(false);
    };

    const isMaxEnvironmentsReached = meta?.environments && meta?.plan && meta?.environments.length >= meta?.plan?.environments_max;
    let tooltipContent: React.ReactNode = null;
    if (isMaxEnvironmentsReached) {
        tooltipContent = (
            <span>
                Max number of environments reached.{' '}
                <Link to="https://app.withsurface.com/s/cm1zve3340001l503sm0xtvo1" className="underline">
                    Upgrade
                </Link>{' '}
                to add more
            </span>
        );
    } else if (meta?.plan?.environments_max === undefined) {
        tooltipContent = <span>Max number of environments reached. Contact us to add more</span>;
    }

    return (
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <SimpleTooltip tooltipContent={tooltipContent} delay={0} triggerClassName="w-full" className="text-gray-400" side="bottom">
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
