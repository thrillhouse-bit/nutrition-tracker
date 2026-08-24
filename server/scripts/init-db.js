// Apply schema.sql to the Neon database named by DATABASE_URL.
//   npm run db:init
import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set. Add it to .env (see .env.example) first.')
    process.exit(1)
  }
  const schemaPath = path.join(__dirname, '..', '..', 'schema.sql')
  const sqlText = await fs.readFile(schemaPath, 'utf8')
  const sql = neon(url)

  // Strip `--` comment lines FIRST, then split on `;`. (Splitting first would
  // glue a leading comment block onto the following CREATE and, if we filtered
  // chunks starting with `--`, silently drop that whole statement.)
  const statements = sqlText
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const stmt of statements) {
    await sql.query(stmt)
  }
  console.log(`Applied ${statements.length} statements to the database.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
