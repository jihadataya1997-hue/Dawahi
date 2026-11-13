// نسخ احتياطي يومي لقاعدة البيانات + صور الطلبات
// النسخ تُحفظ خارج volume البيانات (مجلد /srv/dawahi-backups على السيرفر)
import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { db, DATA_DIR, UPLOADS_DIR } from './db.mjs'
import { log } from './lib.mjs'

export const BACKUP_DIR = process.env.BACKUP_DIR || join(DATA_DIR, 'backups')
const KEEP_DAYS = 14
const NAME_RE = /^dawahi-\d{4}-\d{2}-\d{2}\.db$/

// تاريخ اليوم بتوقيت دمشق (UTC+3)
const damascusDate = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10)

let running = false

export async function runBackup({ force = false } = {}) {
  if (running) return null
  running = true
  try {
    await mkdir(join(BACKUP_DIR, 'uploads'), { recursive: true })
    const name = `dawahi-${damascusDate()}.db`
    const target = join(BACKUP_DIR, name)
    if (existsSync(target) && !force) return name

    // VACUUM INTO يأخذ نسخة سليمة ومتناسقة حتى والسيرفر شغال
    const tmp = `${target}.tmp`
    await rm(tmp, { force: true })
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`)
    await rename(tmp, target)

    // صور الطلبات: ننسخ الجديد فقط
    let copied = 0
    for (const f of await readdir(UPLOADS_DIR)) {
      const dest = join(BACKUP_DIR, 'uploads', f)
      if (!existsSync(dest)) {
        await copyFile(join(UPLOADS_DIR, f), dest)
        copied++
      }
    }

    // حذف النسخ الأقدم من 14 يوم
    const files = (await readdir(BACKUP_DIR)).filter((f) => NAME_RE.test(f)).sort()
    for (const old of files.slice(0, Math.max(0, files.length - KEEP_DAYS))) await rm(join(BACKUP_DIR, old))

    const { size } = await stat(target)
    log('info', 'backup done', { name, size, photosCopied: copied })
    return name
  } catch (err) {
    log('error', 'backup failed', { err: err?.stack || String(err) })
    throw err
  } finally {
    running = false
  }
}

export async function listBackups() {
  if (!existsSync(BACKUP_DIR)) return []
  const files = (await readdir(BACKUP_DIR)).filter((f) => NAME_RE.test(f)).sort().reverse()
  return Promise.all(
    files.map(async (name) => {
      const s = await stat(join(BACKUP_DIR, name))
      return { name, size: s.size, createdAt: s.mtime.toISOString() }
    })
  )
}

export const isBackupName = (n) => NAME_RE.test(n)

// بعد التشغيل بدقيقة، ثم كل ساعة: إذا ما في نسخة لليوم، خذ واحدة
export function scheduleBackups() {
  const tick = () => runBackup().catch(() => {})
  setTimeout(tick, 60_000).unref()
  setInterval(tick, 60 * 60 * 1000).unref()
}
