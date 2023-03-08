import { Outlet, Navigate } from 'react-router-dom';
import storage, { LocalStorageKeys } from '../utils/local-storage';
import { isCloud } from '../utils/utils';

const PrivateRoute = (props: any) => {
    const token = storage.getItem(LocalStorageKeys.Authorized);
    return <>{token || !isCloud() ? <Outlet /> : <Navigate to="/signin" replace />}</>;
};

export default PrivateRoute;
