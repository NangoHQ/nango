interface HttpLabelProp {
    path: string
}

export function GET({ path }: HttpLabelProp) {
    return (
        <div className="flex items-center">
            <div className="bg-green-600 bg-opacity-20 p-1 rounded">
                <span className="text-green-600">GET</span>
            </div>
            <span className="text-gray-400 ml-2">{path}</span>
        </div>
    );
}

export function POST({ path }: HttpLabelProp) {
    return (
        <div className="flex items-center">
            <div className="bg-blue-700 bg-opacity-20 p-1 rounded">
                <span className="text-bg-blue-700">POST</span>
            </div>
            <span className="text-gray-400 ml-2">{path}</span>
        </div>
    );
}

export function PUT({ path }: HttpLabelProp) {
    return (
        <div className="flex items-center">
            <div className="bg-amber-200 bg-opacity-20 p-1 rounded">
                <span className="text-amber-200">PUT</span>
            </div>
            <span className="text-gray-400 ml-2">{path}</span>
        </div>
    );
}

export function PATCH({ path }: HttpLabelProp) {
    return (
        <div className="flex items-center">
            <div className="bg-orange-700 bg-opacity-20 p-1 rounded">
                <span className="text-orange-700">PATCH</span>
            </div>
            <span className="text-gray-400 ml-2">{path}</span>
        </div>
    );
}

export function DELETE({ path }: HttpLabelProp) {
    return (
        <div className="flex items-center">
            <div className="bg-pink-600 bg-opacity-20 p-1 rounded">
                <span className="text-pink-600">DEL</span>
            </div>
            <span className="text-gray-400 ml-2">{path}</span>
        </div>
    );
}
