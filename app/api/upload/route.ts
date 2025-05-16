import { type NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { v4 as uuidv4 } from "uuid"
import { existsSync } from "fs"
import * as XLSX from "xlsx"
import { MAX_FILE_SIZE, VIN_REGEX } from "@/lib/validation"

const execPromise = promisify(exec)

const getBaseDir = () => {
  // Use /tmp for serverless (Vercel), otherwise use process.cwd()
  // Vercel sets process.env.AWS_LAMBDA_FUNCTION_VERSION in serverless
  if (process.env.VERCEL || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    return '/tmp';
  }
  return process.cwd();
};

const ensureDirectories = async () => {
  const baseDir = getBaseDir();
  const uploadsDir = join(baseDir, "uploads");
  const outputsDir = join(baseDir, "outputs");
  const jobsDir = join(baseDir, "jobs");

  if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true });
  if (!existsSync(outputsDir)) await mkdir(outputsDir, { recursive: true });
  if (!existsSync(jobsDir)) await mkdir(jobsDir, { recursive: true });

  return { uploadsDir, outputsDir, jobsDir };
}

async function validateExcelFile(fileBuffer: Buffer, fileName: string) {
  if (!fileName.toLowerCase().endsWith(".xlsx") && !fileName.toLowerCase().endsWith(".xls")) {
    return { isValid: false, error: "Only Excel files (.xlsx, .xls) are supported" }
  }

  try {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" })

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return { isValid: false, error: "The Excel file does not contain any sheets" }
    }

    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

    if (!data || data.length === 0) {
      return { isValid: false, error: "The Excel file is empty" }
    }

    let validRowCount = 0
    let vinCount = 0
    let invalidVins = 0

    const rowsToCheck = Math.min(data.length, 100)
    for (let i = 0; i < rowsToCheck; i++) {
      const row = data[i] as any[]
      if (row && row.length >= 2) {
        validRowCount++

        const potentialVin = String(row[1]).trim().toUpperCase()
        if (potentialVin.length === 17) {
          vinCount++
          if (!VIN_REGEX.test(potentialVin)) {
            invalidVins++
          }
        }
      }
    }

    if (validRowCount === 0) {
      return { isValid: false, error: "No valid data rows found in the Excel file" }
    }

    if (vinCount === 0) {
      return { isValid: false, error: "No potential VINs found in the second column" }
    }

    if (invalidVins > vinCount / 2) {
      return { isValid: false, error: "Many entries in the second column do not appear to be valid VINs" }
    }

    return { isValid: true }
  } catch (error) {
    console.error("Excel validation error:", error)
    return {
      isValid: false,
      error: "Failed to parse the Excel file. The file may be corrupted or in an unsupported format",
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { uploadsDir, outputsDir, jobsDir } = await ensureDirectories()

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 },
      )
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const validationResult = await validateExcelFile(fileBuffer, file.name)
    if (!validationResult.isValid) {
      return NextResponse.json({ error: validationResult.error }, { status: 400 })
    }

    const jobId = uuidv4()

    const filePath = join(uploadsDir, `${jobId}_${file.name}`)
    await writeFile(filePath, fileBuffer)

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

    const scriptPath = join(process.cwd(), "scripts", "vin_decoder.js")


    const env = {
      NODE_ENV: process.env.NODE_ENV || 'development',
      PATH: process.env.PATH,
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("NPM_"))),
    }

    execPromise(
      `python ${scriptPath} --input "${filePath}" --job-id "${jobId}" --jobs-dir "${jobsDir}" --outputs-dir "${outputsDir}"`,
      { env },
    ).catch((error) => {
      console.error("Error executing Python script:", error)
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
