import { Outlet, Navigate } from 'react-router-dom';
import storage, { LocalStorageKeys } from '../utils/local-storage';

const PrivateRoute = (props: any) => {
    const token = storage.getItem(LocalStorageKeys.Authorized);
    return <>{token ? <Outlet /> : <Navigate to="/signin" replace />}</>;
};

export default PrivateRoute;
