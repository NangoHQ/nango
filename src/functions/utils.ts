// Is the given object empty e.g. {}?
export function isEmpty(obj: Object) {
  return Object.getOwnPropertyNames(obj).length === 0
}
