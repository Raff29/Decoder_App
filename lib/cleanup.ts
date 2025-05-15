import { unlink } from 'fs/promises';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

export async function deleteFileifExists(filePath: string): Promise<boolean> {
  try {
    if (existsSync(filePath)) {
      await unlink(filePath)
      return true
    }
    return false
  } catch (error) {
    console.error (`Error deleteing file ${filePath}:`, error)
    return false
  }
}

export async function cleanupJobFiles(jobId: string): Promise<void> {
  try {
    const rootDir = process.cwd()
    const jobDir = path.join(rootDir, "jobs")
    const uplaodsDir = path.join(rootDir, "uploads")
    const outputsDir = path.join(rootDir, "outputs")

    const jobStatusPath = path.join(jobDir, `${jobId}.json`)

    let uploadedFilePath = ""
    let outputFilePath = ""

    if (existsSync(jobStatusPath)) {
      try {
        const jobStatusRaw = JSON.parse(readFileSync(jobStatusPath, "utf-8"))
        uploadedFilePath = jobStatusRaw.filePath || ""
        outputFilePath = jobStatusRaw.filePath || ""
      } catch (e) {
        console.error("Error reading job status file:", e)
      }
    }

    if (uploadedFilePath) {
      await deleteFileifExists(uploadedFilePath)
    }

    if (outputFilePath) {
      await deleteFileifExists(outputFilePath)
    }

    await deleteFileifExists(jobStatusPath)

    console.log(`Cleaned up files for job ${jobId}`)
    } catch (error) {
    console.error(`Error cleaning up job files for ${jobId}:`, error)
  }
}

  export function scheduleCleanup(jobId: string, delayMs = 5 * 60 *1000): void {
    setTimeout(() => {
      cleanupJobFiles(jobId).catch(console.error)
    }, delayMs)
  }
