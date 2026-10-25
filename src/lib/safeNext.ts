export function getSafeNextPath(nextParam: string | null): string {
  return nextParam &&
    /^\/(?![/\\])/.test(nextParam) &&
    !nextParam.includes("\\")
    ? nextParam
    : "/";
}
