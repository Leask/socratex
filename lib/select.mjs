export default async (upstream, { data, connection }) => {
    if (Function.isFunction(upstream)) {
        let returnValue = upstream(data, connection);
        if (returnValue instanceof Promise) {
            returnValue = await returnValue;
        }
        if (returnValue !== 'localhost') {
            return returnValue;
        }
    }
    return false;
};
