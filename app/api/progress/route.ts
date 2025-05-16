import type { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { scheduleCleanup } from "@/lib/jobCleanup";

// Polyfill Response for Node.js/Jest if not available
// @ts-ignore
const WebResponse =
  typeof Response !== "undefined"
    ? Response
    : class {
        body: any;
        status: number;
        headers: { get: (key: string) => any };
        constructor(body: any, init?: any) {
          this.body = body;
          this.status = init?.status ?? 200;
          this.headers = {
            get: (key: string) => (init?.headers ? init.headers[key] : null),
          };
        }
        async text() {
          return this.body;
        }
        async json() {
          return JSON.parse(this.body);
        }
      };

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return new WebResponse(JSON.stringify({ error: "Job ID is required" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let intervalId: any;
      const jobsDir = join(process.cwd(), "jobs");
      const jobStatusPath = join(jobsDir, `${jobId}.json`);

      if (!existsSync(jobStatusPath)) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              message: "Job not found",
            })}\n\n`
          )
        );
        controller.close();
        return;
      }

      const sendUpdate = async () => {
        try {
          const jobStatusRaw = await readFile(jobStatusPath, "utf-8");
          const jobStatus = JSON.parse(jobStatusRaw);

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
                })}\n\n`
              )
            );
          } else if (jobStatus.status === "completed") {
            const filename = jobStatus.outputFilename || "decoded_vins.csv";
            const downloadUrl = `/api/download?jobId=${jobId}`;

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "complete",
                  downloadUrl,
                  filename,
                })}\n\n`
              )
            );

            scheduleCleanup(jobId, 5 * 60 * 1000);

            clearInterval(intervalId);
            controller.close();
          } else if (jobStatus.status === "error") {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message:
                    jobStatus.error || "An error occurred during processing",
                })}\n\n`
              )
            );

            scheduleCleanup(jobId, 5 * 60 * 1000);

            clearInterval(intervalId);
            controller.close();
          }
        } catch (error) {
          console.error("Error sending update:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message: "Failed to get job status",
              })}\n\n`
            )
          );

          clearInterval(intervalId);
          controller.close();
        }
      };

      await sendUpdate();

      intervalId = setInterval(sendUpdate, 1000);

      request.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
        controller.close();
      });
    },
  });

  return new WebResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
