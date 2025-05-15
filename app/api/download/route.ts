import { type NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const jobId = searchParams.get("jobId")

  if (!jobId) {
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 })
  }

  try {
    const jobsDir = join(process.cwd(), "jobs")
    const jobStatusPath = join(jobsDir, `${jobId}.json`)

    // Check if job exists
    if (!existsSync(jobStatusPath)) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Read job status
    const jobStatusRaw = await readFile(jobStatusPath, "utf-8")
    const jobStatus = JSON.parse(jobStatusRaw)

    if (jobStatus.status !== "completed") {
      return NextResponse.json({ error: "Job is not completed yet" }, { status: 400 })
    }

    if (!jobStatus.outputPath || !existsSync(jobStatus.outputPath)) {
      return NextResponse.json({ error: "Output file not found" }, { status: 404 })
    }

    // Read the output file
    const fileContent = await readFile(jobStatus.outputPath)

    // Set appropriate headers for file download
    const filename = jobStatus.outputFilename || "decoded_vins.csv"

    return new NextResponse(fileContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Download error:", error)
    return NextResponse.json({ error: "Failed to download the file" }, { status: 500 })
  }
}
