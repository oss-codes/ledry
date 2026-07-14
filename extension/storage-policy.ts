export function connectionConfigChanged(
  changes: Readonly<Record<string, unknown>>,
  areaName: string,
): boolean {
  return areaName === "local" && ("port" in changes || "token" in changes)
}
