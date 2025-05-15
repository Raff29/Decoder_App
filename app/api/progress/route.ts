import type { NextRequest } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const jobId = searchParams.get("jobId")

  if (!jobId) {
    return new Response(JSON.stringify({ error: "Job ID is required" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
      },
    })
  }

  // Set up SSE response headers
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const jobsDir = join(process.cwd(), "jobs")
      const jobStatusPath = join(jobsDir, `${jobId}.json`)

      // Check if job exists
      if (!existsSync(jobStatusPath)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Job not found" })}\n\n`))
        controller.close()
        return
      }

      // Function to send job status updates
      const sendUpdate = async () => {
        try {
          // Read the current job status
          const jobStatusRaw = await readFile(jobStatusPath, "utf-8")
          const jobStatus = JSON.parse(jobStatusRaw)

          // Send appropriate event based on job status
          if (jobStatus.status === "processing") {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "progress",
                  currentBatch: jobStatus.currentBatch,
                  totalBatches: jobStatus.totalBatches,
                  progress: jobStatus.progress,
                  elapsedTime: jobStatus.elapsedTime,
                  estimatedTimeRemaining: jobStatus.estimatedTimeRemaining,
                })}\n\n`,
              ),
            )
          } else if (jobStatus.status === "completed") {
            // Generate download URL
            const filename = jobStatus.outputFilename || "decoded_vins.csv"
            const downloadUrl = `/api/download?jobId=${jobId}`

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "complete",
                  downloadUrl,
                  filename,
                })}\n\n`,
              ),
            )

            // End the stream after completion
            clearInterval(intervalId)
            controller.close()
          } else if (jobStatus.status === "error") {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message: jobStatus.error || "An error occurred during processing",
                })}\n\n`,
              ),
            )

            // End the stream after error
            clearInterval(intervalId)
            controller.close()
          }
        } catch (error) {
          console.error("Error sending update:", error)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message: "Failed to get job status",
              })}\n\n`,
            ),
          )

          clearInterval(intervalId)
          controller.close()
        }
      }

      // Send initial update
      await sendUpdate()

      // Set up interval to send updates every second
      const intervalId = setInterval(sendUpdate, 1000)

      // Clean up interval if the client disconnects
      request.signal.addEventListener("abort", () => {
        clearInterval(intervalId)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
