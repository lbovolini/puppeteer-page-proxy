 const map = {
    "[object Undefined]": "undefined",
    "[object Null]": "null",
    "[object Object]": "object",
    "[object Array]": "array", 
    "[object Boolean]": "boolean", 
    "[object Function]": "function", 
    "[object Number]": "number", 
    "[object BigInt]": "bigint", 
    "[object String]": "string", 
    "[object Symbol]": "symbol",
    // Typed arrays
    "[object Float32Array]": "array",
    "[object Float64Array]": "array",
    "[object Int8Array]": "array",
    "[object Int16Array]": "array",
    "[object Int32Array]": "array",
    "[object Uint8Array]": "array",
    "[object Uint8ClampedArray]": "array",
    "[object Uint16Array]": "array",
    "[object Uint32Array]": "array",
    "[object BigInt64Array]": "array",
    "[object BigUint64Array]": "array"
};

const type = (value) => {
    const type = Object.prototype.toString.call(value);
    return (map[type] === undefined) ? "object" : map[type];
}

const circularReplacer = () => {
	
    const ancestors = [];

	return function (key, value) {

        if (typeof value !== "object" || value === null) {
            return value;
        }
        // `this` is the object that value is contained in,
        // i.e., its direct parent.
        while (ancestors.length > 0 && ancestors.at(-1) !== this) {
            ancestors.pop();
        }

        if (ancestors.includes(value)) {
            return "[Circular]";
        }

        ancestors.push(value);

        return Array.isArray(value) ? "[...]" : value
    };
  }

const prettyPrint = (e) => JSON.stringify(e, circularReplacer(), 2);

export { 
    type,
    prettyPrint
}