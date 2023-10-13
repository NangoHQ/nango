export default async function fetchData(nango: any) {
    const other = someOther();
    console.log(other);
    return await nango.get();
}

function someOther() {
    return 'nango';
}
