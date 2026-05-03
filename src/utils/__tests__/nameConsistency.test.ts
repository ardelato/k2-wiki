import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC_ROOT = join(__dirname, '..', '..')
const REPO_ROOT = join(SRC_ROOT, '..')

const SKIP_DIRS = new Set(['__tests__', 'data', 'types', 'test'])
const SKIP_FILES = new Set(['format.ts'])

const ANTI_PATTERNS: { regex: RegExp; fix: string }[] = [
  {
    regex: /toTitleCase\([^)]*\b(?:itemId|toolId|machineId|requiresItem)\b/,
    fix: 'use itemName/toolName/machineName from @/utils/format instead of toTitleCase on an *Id value',
  },
  {
    regex: /\b(?:itemId|toolId|machineId)\b\s*\.replace\(\s*\/-\/g/,
    fix: 'use itemName/toolName/machineName from @/utils/format instead of replacing hyphens on an *Id value',
  },
  {
    regex: /:(?:alt|title|aria-label)\s*=\s*"[^"]*\.(?:itemId|toolId|machineId)\s*"/,
    fix: 'wrap the *Id value with itemName/toolName/machineName before binding it to alt/title/aria-label',
  },
]

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      collectSourceFiles(full, acc)
      continue
    }
    if (!stat.isFile()) continue
    if (SKIP_FILES.has(entry)) continue
    if (!/\.(?:vue|ts)$/.test(entry)) continue
    acc.push(full)
  }
  return acc
}

interface Violation {
  file: string
  line: number
  text: string
  fix: string
}

function findViolations(): Violation[] {
  const violations: Violation[] = []
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      for (const { regex, fix } of ANTI_PATTERNS) {
        if (regex.test(lines[i])) {
          violations.push({
            file: relative(REPO_ROOT, file),
            line: i + 1,
            text: lines[i].trim(),
            fix,
          })
        }
      }
    }
  }
  return violations
}

describe('item / tool / machine name consistency', () => {
  test('no source file uses toTitleCase or .replace on an *Id value for display', () => {
    const violations = findViolations()
    if (violations.length > 0) {
      const message = violations
        .map((v) => `  ${v.file}:${v.line}\n    ${v.text}\n    → ${v.fix}`)
        .join('\n')
      throw new Error(`Found ${violations.length} item-name anti-pattern violation(s):\n${message}`)
    }
    expect(violations).toEqual([])
  })
})
