import { CheckInCircle, AlertCircle, Link as LinkIcon } from '@geist-ui/icons'

import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';

export default function Activity() {
    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Activity}>
            <div className="px-16 w-fit mx-auto">
                <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Activity</h2>
                <div className="h-fit border border-border-gray rounded-md text-white text-sm">
                    <table className="table-auto">
                        <tbody className="px-4">
                                <tr key="1">
                                    <td className={`mx-8 flex items-center place-content-center h-16`}>
                                        <CheckInCircle className="stroke-green-500" />
                                        <div className="bg-pink-300">
                                            <LinkIcon className="stroke-pink-500" />
                                            auth
                                        </div>
                                        <div className="w-largecell text-t font-mono">1</div>
                                        <div className="w-80 flex pl-8">
                                            <img src={`images/template-logos/github.svg`} alt="" className="h-7 mt-0.5 mr-0.5" />
                                            <p className="mt-1.5 mr-4 ml-0.5">Foo</p>
                                        </div>
                                    </td>
                                </tr>
                                <tr key="1">
                                    <td className={`mx-8 flex place-content-center h-16`}>
                                        <AlertCircle className="stroke-red-500" />
                                        <div className="mt-5 w-largecell text-t font-mono">1</div>
                                        <div className="mt-4 w-80 flex pl-8">
                                            <img src={`images/template-logos/github.svg`} alt="" className="h-7 mt-0.5 mr-0.5" />
                                            <p className="mt-1.5 mr-4 ml-0.5">Foo</p>
                                        </div>
                                    </td>
                                </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </DashboardLayout>
    );
}
