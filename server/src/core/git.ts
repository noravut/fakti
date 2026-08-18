import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import type { DiffStat, GitStatus } from '@shared/types'

const execFileAsync = promisify(execFile)

/**
 * ทุกคำสั่ง git ผ่านตรงนี้ที่เดียว args เป็น array เสมอ
 * ห้ามต่อ user input เป็น shell string
 */
const git = (cwd: string, args: string[]) =>
  execFileAsync('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 })

/** ชื่อ branch ที่ยอมให้ส่งเข้า git ได้ */
export const BRANCH_RE = /^[a-zA-Z0-9._/-]+$/

export function isValidBranchName(name: string): boolean {
  return BRANCH_RE.test(name) && !name.startsWith('-') && !name.includes('..')
}

/** path ต้องเป็น absolute และมีอยู่จริงเป็น directory */
export function isUsablePath(p: string): boolean {
  if (!path.isAbsolute(p)) return false
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ['rev-parse', '--git-dir'])
    return true
  } catch {
    return false
  }
}

export async function getRemote(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await git(cwd, ['remote', 'get-url', 'origin'])
    return stdout.trim() || undefined
  } catch {
    return undefined // repo ที่ไม่มี remote ก็ใช้ได้
  }
}

export async function listBranches(cwd: string): Promise<string[]> {
  const { stdout } = await git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
  return stdout.split('\n').map(s => s.trim()).filter(Boolean)
}

export async function currentBranch(cwd: string): Promise<string> {
  const { stdout } = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return stdout.trim()
}

export async function headCommit(cwd: string): Promise<string> {
  const { stdout } = await git(cwd, ['rev-parse', 'HEAD'])
  return stdout.trim()
}

export async function status(cwd: string): Promise<GitStatus> {
  const [branch, porcelain] = await Promise.all([
    currentBranch(cwd),
    git(cwd, ['status', '--porcelain']).then(r => r.stdout),
  ])
  const dirtyCount = porcelain.split('\n').filter(l => l.trim().length > 0).length

  let ahead = 0
  let behind = 0
  try {
    // มี upstream ถึงจะนับได้ ไม่มีก็ปล่อย 0
    const { stdout } = await git(cwd, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])
    const [b, a] = stdout.trim().split(/\s+/)
    behind = Number(b) || 0
    ahead = Number(a) || 0
  } catch {
    /* ไม่มี upstream */
  }

  return { branch, isDirty: dirtyCount > 0, dirtyCount, ahead, behind }
}

export async function fetch(cwd: string): Promise<void> {
  try {
    await git(cwd, ['fetch', 'origin'])
  } catch {
    // อาจไม่มีเน็ต / ไม่มี remote — ปล่อยผ่านตามสเปค
  }
}

/**
 * สร้าง branch ใหม่จาก origin/<base> ถ้าไม่มี remote ref ให้ตกมาใช้ <base> ในเครื่อง
 * คืน true ถ้าสร้างสำเร็จ (ใช้ตัดสินใจตอน discard ว่าลบ branch ได้ไหม)
 */
export async function createBranch(cwd: string, name: string, base: string): Promise<void> {
  if (!isValidBranchName(name)) throw new Error(`ชื่อ branch ไม่ถูกต้อง: ${name}`)
  if (!isValidBranchName(base)) throw new Error(`ชื่อ base branch ไม่ถูกต้อง: ${base}`)
  try {
    await git(cwd, ['checkout', '-b', name, `origin/${base}`])
  } catch {
    await git(cwd, ['checkout', '-b', name, base])
  }
}

/** สลับไป branch ที่มีอยู่แล้ว — ใช้ตอนเปิด session เดิมขึ้นมาใหม่ */
export async function checkoutExisting(cwd: string, branch: string): Promise<void> {
  if (!isValidBranchName(branch)) throw new Error(`ชื่อ branch ไม่ถูกต้อง: ${branch}`)
  await git(cwd, ['checkout', branch])
}

export async function branchExists(cwd: string, name: string): Promise<boolean> {
  try {
    await git(cwd, ['rev-parse', '--verify', `refs/heads/${name}`])
    return true
  } catch {
    return false
  }
}

export async function stash(cwd: string, message: string): Promise<void> {
  await git(cwd, ['stash', 'push', '-u', '-m', message])
}

export async function diffStat(cwd: string, base: string): Promise<DiffStat> {
  const [numstat, commits] = await Promise.all([
    git(cwd, ['diff', '--numstat', base]).then(r => r.stdout),
    logCommits(cwd, base),
  ])

  const files = numstat
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const [added, removed, ...rest] = line.split('\t')
      return {
        path: rest.join('\t'),
        // ไฟล์ binary git ให้ "-" มา → นับเป็น 0
        added: Number(added) || 0,
        removed: Number(removed) || 0,
      }
    })
    .filter(f => f.path.length > 0)

  return {
    files,
    totalAdded: files.reduce((n, f) => n + f.added, 0),
    totalRemoved: files.reduce((n, f) => n + f.removed, 0),
    commits,
  }
}

async function logCommits(cwd: string, base: string): Promise<DiffStat['commits']> {
  // \x1e คั่นแต่ละ commit, \x1f คั่น hash กับ subject — กัน subject ที่มี tab/newline
  const { stdout } = await git(cwd, [
    'log', `${base}..HEAD`, '--name-only', '--format=%x1e%H%x1f%s',
  ])

  return stdout
    .split('\x1e')
    .map(chunk => chunk.split('\n').map(l => l.trim()).filter(Boolean))
    .filter(lines => lines.length > 0)
    .map(lines => {
      const [head, ...files] = lines as [string, ...string[]]
      const sep = head.indexOf('\x1f')
      return {
        hash: head.slice(0, sep),
        subject: head.slice(sep + 1),
        fileCount: files.length,
      }
    })
    .filter(c => c.hash.length > 0)
}

/**
 * ทิ้งงานทั้งหมดของ session: คืน working tree, กลับ base branch, ลบ branch
 * deleteBranch = false เมื่อ session ทำงานบน branch เดิมของผู้ใช้ (dirtyStrategy 'keep')
 * — ลบไปจะกินงานคนอื่น
 */
export async function discard(
  cwd: string,
  branch: string,
  baseBranch: string,
  deleteBranch: boolean,
): Promise<void> {
  if (!isValidBranchName(branch)) throw new Error(`ชื่อ branch ไม่ถูกต้อง: ${branch}`)
  if (!isValidBranchName(baseBranch)) throw new Error(`ชื่อ base branch ไม่ถูกต้อง: ${baseBranch}`)

  await git(cwd, ['checkout', '--', '.'])
  await git(cwd, ['clean', '-fd'])
  await git(cwd, ['checkout', baseBranch])
  if (deleteBranch && branch !== baseBranch) {
    await git(cwd, ['branch', '-D', branch])
  }
}
