import { type NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { v4 as uuidv4 } from "uuid"
import { existsSync } from "fs"

const execPromise = promisify(exec)

// Create necessary directories
const ensureDirectories = async () => {
  const uploadsDir = join(process.cwd(), "uploads")
  const outputsDir = join(process.cwd(), "outputs")
  const jobsDir = join(process.cwd(), "jobs")

  if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true })
  if (!existsSync(outputsDir)) await mkdir(outputsDir, { recursive: true })
  if (!existsSync(jobsDir)) await mkdir(jobsDir, { recursive: true })

  return { uploadsDir, outputsDir, jobsDir }
}

export async function POST(request: NextRequest) {
  try {
    const { uploadsDir, outputsDir, jobsDir } = await ensureDirectories()

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file type
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json({ error: "Only Excel files (.xlsx, .xls) are supported" }, { status: 400 })
    }

    // Generate a unique job ID
    const jobId = uuidv4()

    // Save the uploaded file
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const filePath = join(uploadsDir, `${jobId}_${file.name}`)
    await writeFile(filePath, fileBuffer)

    // Create a job status file
    const jobStatusPath = join(jobsDir, `${jobId}.json`)
    const jobStatus = {
      id: jobId,
      status: "queued",
      filename: file.name,
      filePath,
      progress: 0,
      currentBatch: 0,
      totalBatches: 0,
      startTime: Date.now(),
      elapsedTime: 0,
      estimatedTimeRemaining: 0,
      outputPath: "",
      error: "",
    }

    await writeFile(jobStatusPath, JSON.stringify(jobStatus))

    // Start the Python script in the background
    const scriptPath = join(process.cwd(), "scripts", "vin_decoder.py")

    // Execute the Python script asynchronously
    // Use a clean environment to avoid passing sensitive env vars
    const env = {
      PATH: process.env.PATH,
      // Add only the environment variables needed by the Python script
      // Explicitly exclude npm-related variables
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("NPM_"))),
    }

    execPromise(
      `python ${scriptPath} --input "${filePath}" --job-id "${jobId}" --jobs-dir "${jobsDir}" --outputs-dir "${outputsDir}"`,
      { env },
    ).catch((error) => {
      console.error("Error executing Python script:", error)
      // Update job status with error
      const errorStatus = {
        ...jobStatus,
        status: "error",
        error: error.message || "Failed to execute Python script",
      }
      writeFile(jobStatusPath, JSON.stringify(errorStatus)).catch(console.error)
    })

    return NextResponse.json({ jobId })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Failed to process the file" }, { status: 500 })
  }
}
