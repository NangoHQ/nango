import { Modal } from '@geist-ui/core';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Spinner from './Spinner';
import Button from './button/Button';

interface ModalProps {
    bindings: any;
    modalTitleColor: string;
    modalShowSpinner: boolean;
    modalContent: string | React.ReactNode;
    modalTitle: string;
    modalAction: (() => void) | null;
    setVisible: (visible: boolean) => void;
    modalOkTitle?: string;
    modalCancelTitle?: string;
    modalOkLink?: string | null;
    modalCancelLink?: string | null;
}

export default function ActionModal({
    bindings,
    modalTitleColor,
    modalShowSpinner,
    modalContent,
    modalTitle,
    modalAction,
    setVisible,
    modalOkTitle,
    modalCancelTitle,
    modalOkLink,
    modalCancelLink
}: ModalProps) {
    const modalOkAction = () => {
        if (modalOkLink) {
            window.open(modalOkLink, '_blank');
        } else {
            modalAction && modalAction();
        }
    };

    const modalCancelAction = () => {
        if (modalCancelLink) {
            window.open(modalCancelLink, '_blank');
        } else {
            setVisible(false);
        }
    };

    return (
        <Modal {...bindings} wrapClassName="!h-[200px] !w-[550px] !max-w-[550px] !bg-off-black no-border-modal !border !border-neutral-700">
            <div className="flex justify-between text-sm">
                <div>
                    <Modal.Content className="overflow-scroll !h-[190px] max-w-[550px] flex flex-col justify-between h-full">
                        <div>
                            <div className="flex -mt-3 justify-between w-[500px] items-center">
                                <span className="flex items-center -mt-3">
                                    <h1 className={`${modalTitleColor} text-base mr-3 py-2`}>{modalTitle}</h1>
                                    {modalShowSpinner && <Spinner size={2} />}
                                </span>
                                <XMarkIcon
                                    className="flex -mt-4 cursor-pointer hover:bg-active-gray h-7 w-7 text-gray-400 p-1"
                                    onClick={() => setVisible(false)}
                                />
                            </div>
                            <div className="mt-2 mb-4 text-sm text-white">{modalContent}</div>
                        </div>
                        <div className="flex pb-4">
                            {modalAction && (
                                <Button className="mr-4" disabled={modalShowSpinner} variant="primary" onClick={modalOkAction}>
                                    {modalOkTitle || 'Confirm'}
                                </Button>
                            )}
                            <Button className="!text-text-light-gray" variant="zombie" onClick={modalCancelAction}>
                                {modalCancelTitle || 'Cancel'}
                            </Button>
                        </div>
                    </Modal.Content>
                </div>
            </div>
        </Modal>
    );
}
