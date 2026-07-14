import { permissionPatternForUrl } from "./policy"

export interface PermissionRequester {
  request(permissions: chrome.permissions.Permissions): Promise<boolean>
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
