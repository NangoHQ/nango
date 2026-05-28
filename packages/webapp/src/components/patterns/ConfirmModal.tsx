import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from './ui/Dialog';
import { Button } from './ui/button/Button';

interface ConfirmModalProps {
    title: string;
    description: string;
    confirmButtonText: string;
    trigger: React.ReactNode;
    loading: boolean;
    onConfirm: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ title, description, confirmButtonText, trigger, loading, onConfirm }) => {
    return (
        <Dialog>
            <DialogTrigger>{trigger}</DialogTrigger>
            <DialogContent>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>

                <DialogFooter className="mt-4">
                    <DialogClose asChild>
                        <Button variant="zinc">Cancel</Button>
                    </DialogClose>
                    <Button variant="danger" onClick={onConfirm} isLoading={loading}>
                        {confirmButtonText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
