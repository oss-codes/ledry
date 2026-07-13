import { chmod, link, mkdir, open, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { z } from "zod"

const ConfigFileSchema = z.object({
  token: z.string().min(16),
  port: z.number().int().min(1024).max(65535),
})

export type AppConfig = z.infer<typeof ConfigFileSchema>

export const configPath = join(homedir(), ".ledry", "config.json")

export async function loadConfig(path = configPath): Promise<AppConfig> {
  const file = Bun.file(path)
  if (await file.exists()) {
    await chmod(dirname(path), 0o700)
    await chmod(path, 0o600)
    return ConfigFileSchema.parse(await file.json())
  }

  const config = {
    token: crypto.randomUUID().replaceAll("-", ""),
    port: 43110,
  } satisfies AppConfig
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await chmod(dirname(path), 0o700)
  const temporaryPath = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
  const handle = await open(temporaryPath, "wx", 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(config, null, 2)}\n`)
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await link(temporaryPath, path)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      await unlink(temporaryPath)
      await chmod(path, 0o600)
      return ConfigFileSchema.parse(await Bun.file(path).json())
    }
    await unlink(temporaryPath)
    throw error
  }
  await unlink(temporaryPath)
  await chmod(path, 0o600)
  return config
}
