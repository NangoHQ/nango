import { useRef, useState } from 'react';
import { Input } from '../../../components/ui/input/Input';
import { apiPutTeam, useTeam } from '../../../hooks/useTeam';
import { useStore } from '../../../store';
import { CopyButton } from '../../../components/ui/button/CopyButton';
import Button from '../../../components/ui/button/Button';
import { Pencil1Icon } from '@radix-ui/react-icons';
import { useToast } from '../../../hooks/useToast';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/Tooltip';

export const TeamInfo: React.FC = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { team, mutate } = useTeam(env);

    const ref = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(() => team?.name || '');
    const [edit, setEdit] = useState(false);

    const onSave = async () => {
        const update = await apiPutTeam(env, { name });

        if (!update || update.res.status === 200) {
            toast({ title: 'Team updated successfully', variant: 'success' });
            setEdit(false);
            void mutate();
        }
    };

    if (!team) {
        return null;
    }

    return (
        <div className="flex flex-col gap-5">
            <h3 className="font-semibold text-sm text-white">Team Name</h3>
            <Input
                ref={ref}
                variant={'flat'}
                inputSize={'lg'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!edit}
                after={
                    <div className="flex gap-1 items-center">
                        <CopyButton text={name} />
                        {!edit && (
                            <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={'icon'}
                                        size={'sm'}
                                        onClick={() => {
                                            setEdit(true);
                                            setTimeout(() => {
                                                ref.current?.focus();
                                            }, 100);
                                        }}
                                    >
                                        <Pencil1Icon />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={10}>Edit</TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                }
            />
            {edit && (
                <div className="flex justify-end gap-1 items-center">
                    <Button
                        size={'sm'}
                        variant={'zinc'}
                        onClick={() => {
                            setName(team.name);
                            setEdit(false);
                        }}
                    >
                        Cancel
                    </Button>
                    <Button size={'sm'} onClick={onSave}>
                        Save
                    </Button>
                </div>
            )}
        </div>
    );
};
