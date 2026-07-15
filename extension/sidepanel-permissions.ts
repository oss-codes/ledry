import { permissionPatternForUrl } from "./policy"

export interface PermissionRequester {
  request(permissions: chrome.permissions.Permissions): Promise<boolean>
}

export interface PermissionManager extends PermissionRequester {
  contains(permissions: chrome.permissions.Permissions): Promise<boolean>
  remove(permissions: chrome.permissions.Permissions): Promise<boolean>
}

export class OriginPermissionError extends Error {
  override readonly name = "OriginPermissionError"
}

export async function requestOriginPermission(
  origin: string,
  requester: PermissionRequester = chrome.permissions,
): Promise<void> {
  const pattern = permissionPatternForUrl(origin)
  if (pattern === null)
    throw new OriginPermissionError(
      "This tab cannot be approved as a public research source",
    )
  const granted = await requester.request({ origins: [pattern] })
  if (!granted)
    throw new OriginPermissionError(
      "Chrome permission is required to approve this origin",
    )
}

export async function withOriginPermission<T>(
  origin: string,
  operation: () => Promise<T>,
  manager: PermissionManager = chrome.permissions,
  rollbackOnFailure: (error: unknown) => Promise<boolean> = async () => true,
): Promise<T> {
  const pattern = permissionPatternForUrl(origin)
  if (pattern === null)
    throw new OriginPermissionError(
      "This tab cannot be approved as a public research source",
    )
  const permissions = { origins: [pattern] }
  const existed = await manager.contains(permissions)
  if (!existed) await requestOriginPermission(origin, manager)
  try {
    return await operation()
  } catch (error) {
    if (!existed && (await rollbackOnFailure(error)))
      await manager.remove(permissions)
    throw error
  }
}
