import type { NextRequest } from "next/server";
import { join } from "path";
import { existsSync, writeFileSync } from "fs";

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
        async json() {
          return JSON.parse(this.body);
        }
      };

export async function POST(request: NextRequest) {
  const { jobId } = await request.json();

  if (!jobId) {
    return new WebResponse(JSON.stringify({ error: "Job ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const jobsDir = join(process.cwd(), "jobs");
  const jobStatusPath = join(jobsDir, `${jobId}.json`);

  if (!existsSync(jobStatusPath)) {
    return new WebResponse(JSON.stringify({ error: "Job not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const jobStatus = JSON.parse(
      require("fs").readFileSync(jobStatusPath, "utf-8")
    );
    jobStatus.status = "stopped";
    writeFileSync(jobStatusPath, JSON.stringify(jobStatus, null, 2));
    return new WebResponse(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new WebResponse(JSON.stringify({ error: "Failed to stop job" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
