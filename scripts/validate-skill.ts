import { readFile } from "node:fs/promises"
import { basename, join } from "node:path"

const skillDirectory = join(import.meta.dir, "..", "skills", "ledry")
const contents = await readFile(join(skillDirectory, "SKILL.md"), "utf8")
const match = contents.match(
  /^---\nname: ([a-z0-9]+(?:-[a-z0-9]+)*)\ndescription: ([^\n]+)\n---\n/,
)

if (match === null)
  throw new Error("SKILL.md must contain name and description frontmatter")
if (match[1] !== basename(skillDirectory))
  throw new Error("Skill name must match its directory")
if ((match[2]?.length ?? 0) > 1024)
  throw new Error("Skill description exceeds 1024 characters")
if (!contents.includes("## Verify"))
  throw new Error("Skill must define verification steps")

process.stdout.write("Skill is valid!\n")
