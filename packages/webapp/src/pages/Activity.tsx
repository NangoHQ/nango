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
                                    <td className={`mx-8 flex place-content-center h-16`}>
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
