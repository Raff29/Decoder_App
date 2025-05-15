import fs from "fs"
import path from "path"
import { deleteFileifExists } from "../lib/cleanup"

function getFilesInDirectory(directory: string): string[] {
  try {
    return fs.readdirSync(directory)
  } catch (error) {
    console.error(`Error reading directory ${directory}:`, error)
    return []
  }
}

function getFileAgeInMinutes(filePath: string): number {
  try {
    const stats = fs.statSync(filePath)
    const fileAgeMs = Date.now() - stats.mtimeMs
    return fileAgeMs / (1000 * 60) 
  } catch (error) {
    console.error(`Error getting file age for ${filePath}:`, error)
    return 0
  }
}

async function cleanupOldFiles() {
  const rootDir = process.cwd()
  const uploadsDir = path.join(rootDir, "uploads")
  const outputsDir = path.join(rootDir, "outputs")
  const jobsDir = path.join(rootDir, "jobs")

  const MAX_AGE_MINUTES = 60 

  const uploadFiles = getFilesInDirectory(uploadsDir)
  for (const file of uploadFiles) {
    const filePath = path.join(uploadsDir, file)
    const ageInMinutes = getFileAgeInMinutes(filePath)
    if (ageInMinutes > MAX_AGE_MINUTES) {
      console.log(`Deleting old uploaded file: ${filePath} (${ageInMinutes.toFixed(2)} minutes old)`)
      await deleteFileifExists(filePath)
    }
  }

  const outputFiles = getFilesInDirectory(outputsDir)
  for (const file of outputFiles) {
    const filePath = path.join(outputsDir, file)
    const ageInMinutes = getFileAgeInMinutes(filePath)
    if (ageInMinutes > MAX_AGE_MINUTES) {
      console.log(`Deleting old output file: ${filePath} (${ageInMinutes.toFixed(2)} minutes old)`)
      await deleteFileifExists(filePath)
    }
  }

  const jobFiles = getFilesInDirectory(jobsDir)
  for (const file of jobFiles) {
    const filePath = path.join(jobsDir, file)
    const ageInMinutes = getFileAgeInMinutes(filePath)
    if (ageInMinutes > MAX_AGE_MINUTES) {
      console.log(`Deleting old job file: ${filePath} (${ageInMinutes.toFixed(2)} minutes old)`)
      await deleteFileifExists(filePath)
    }
  }

  console.log("Cleanup completed")
}

cleanupOldFiles().catch(console.error)
