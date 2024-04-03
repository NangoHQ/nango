import type { FlowEndpoint } from '../../../types';

interface HttpLabelProp {
    path: string;
}

export function HttpLabel({ endpoint }: { endpoint: FlowEndpoint }) {
    return (
        <>
            {endpoint['GET'] && <GET path={endpoint['GET']} />}
            {endpoint['POST'] && <POST path={endpoint['POST']} />}
            {endpoint['PUT'] && <PUT path={endpoint['PUT']} />}
            {endpoint['PATCH'] && <PATCH path={endpoint['PATCH']} />}
            {endpoint['DELETE'] && <DELETE path={endpoint['DELETE']} />}
        </>
    );
}

export function GET({ path }: HttpLabelProp) {
    return (
        <div className="flex items-center">
            <div className="bg-green-600 bg-opacity-20 py-1 px-2 rounded">
                <span className="text-green-600 font-semibold">GET</span>
            </div>
            <span className="text-gray-400 ml-2">{path}</span>
        </div>
    );
}

export function POST({ path }: HttpLabelProp) {
    return (
        <div className="flex items-center">
            <div className="bg-blue-700 bg-opacity-20 py-1 px-2 rounded">
                <span className="text-blue-700 font-semibold">POST</span>
            </div>
            <span className="text-gray-400 ml-2">{path}</span>
        </div>
    );
}

export function PUT({ path }: HttpLabelProp) {
    return (
        <div className="flex items-center">
            <div className="bg-amber-200 bg-opacity-20 py-1 px-2 rounded">
                <span className="text-amber-200 font-semibold">PUT</span>
            </div>
            <span className="text-gray-400 ml-2">{path}</span>
        </div>
    );
}

export function PATCH({ path }: HttpLabelProp) {
    return (
        <div className="flex items-center">
            <div className="bg-orange-700 bg-opacity-20 py-1 px-2 rounded">
                <span className="text-orange-700 font-semibold">PATCH</span>
            </div>
            <span className="text-gray-400 ml-2">{path}</span>
        </div>
    );
}

export function DELETE({ path }: HttpLabelProp) {
    return (
        <div className="flex items-center">
            <div className="bg-pink-600 bg-opacity-20 py-1 px-2 rounded">
                <span className="text-pink-600 font-semibold">DEL</span>
            </div>
            <span className="text-gray-400 ml-2">{path}</span>
        </div>
    );
}
