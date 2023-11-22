import { Modal } from '@geist-ui/core';
import Spinner from './Spinner';
import Button from './button/Button';

interface ModalProps {
    bindings: any;
    modalTitleColor: string;
    modalShowSpinner: boolean;
    modalContent: string;
    modalTitle: string;
    modalAction: (() => void) | null;
    setVisible: (visible: boolean) => void;
}

export default function ActionModal({ bindings, modalTitleColor, modalShowSpinner, modalContent, modalTitle, modalAction, setVisible }: ModalProps) {
    return (
        <Modal {...bindings} wrapClassName="!h-[200px] !w-[550px] !max-w-[550px] !bg-black no-border-modal">
            <div className="flex justify-between text-sm">
                <div>
                    <Modal.Content className="overflow-scroll !h-[190px] max-w-[550px] flex flex-col justify-between h-full">
                        <div>
                            <span className="flex items-center -mt-3">
                                <h1 className={`${modalTitleColor} text-base mr-3 py-2`}>{modalTitle}</h1>
                                {modalShowSpinner && <Spinner size={2} />}
                            </span>
                            <div className="mt-2 text-sm text-white">{modalContent}</div>
                        </div>
                        <div className="flex pb-2">
                            {modalAction && (
                                <Button className="mr-4" disabled={modalShowSpinner} variant="primary" onClick={modalAction}>
                                    Confirm
                                </Button>
                            )}
                            <Button className="!text-text-light-gray" variant="zombie" onClick={() => setVisible(false)}>
                                Cancel
                            </Button>
                        </div>
                    </Modal.Content>
                </div>
            </div>
        </Modal>
    );
}
