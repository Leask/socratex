export default async (upstream, { data, bridgedConnection }) => {
    if (Function.isFunction(upstream)) {
        let returnValue = upstream(data, bridgedConnection);
        if (returnValue instanceof Promise) {
            returnValue = await returnValue;
        }
        if (returnValue !== 'localhost') {
            return returnValue;
        }
    }
    return false;
};
