import type { NextRequest } from "next/server"
import { join } from "path"
import { existsSync, writeFileSync } from "fs"

export async function POST(request: NextRequest) {
  const { jobId } = await request.json()

  if (!jobId) {
    return new Response(JSON.stringify({ error: "Job ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const jobsDir = join(process.cwd(), "jobs")
  const jobStatusPath = join(jobsDir, `${jobId}.json`)

  if (!existsSync(jobStatusPath)) {
    return new Response(JSON.stringify({ error: "Job not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const jobStatus = JSON.parse(require("fs").readFileSync(jobStatusPath, "utf-8"))
    jobStatus.status = "stopped"
    writeFileSync(jobStatusPath, JSON.stringify(jobStatus, null, 2))
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to stop job" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
