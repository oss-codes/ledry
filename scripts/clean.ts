import { rm } from "node:fs/promises"
import { join } from "node:path"

const root = join(import.meta.dir, "..")

await Promise.all(
  ["dist", "web/dist", "extension/dist"].map((path) =>
    rm(join(root, path), { force: true, recursive: true }),
  ),
)
