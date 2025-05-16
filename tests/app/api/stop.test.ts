// Polyfill global Response for Jest before any imports
Object.defineProperty(global, 'Response', {
  value: class {
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
  },
  writable: true,
});

import { join } from "path"
import { POST } from "../../../app/api/progress/stop/route";
const mockExistsSync = require("fs").existsSync as jest.Mock
const mockWriteFileSync = require("fs").writeFileSync as jest.Mock
const mockReadFileSync = require("fs").readFileSync as jest.Mock

jest.mock("fs", () => ({
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
}))

describe("POST", () => {
  const jobsDir = join(process.cwd(), "jobs")
  const jobId = "123"
  const jobStatusPath = join(jobsDir, `${jobId}.json`)

  const makeRequest = (body: any) => ({
    json: jest.fn().mockResolvedValue(body),
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns 400 if jobId is missing", async () => {
    const request = makeRequest({})
    const response = await POST(request as any)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data).toEqual({ error: "Job ID is required" })
  })

  it("returns 404 if job file does not exist", async () => {
    mockExistsSync.mockReturnValue(false)
    const request = makeRequest({ jobId })
    const response = await POST(request as any)
    expect(mockExistsSync).toHaveBeenCalledWith(jobStatusPath)
    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data).toEqual({ error: "Job not found" })
  })

  it("returns 200 and stops the job if job exists", async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ status: "running", foo: "bar" }))
    const request = makeRequest({ jobId })
    const response = await POST(request as any)
    expect(mockReadFileSync).toHaveBeenCalledWith(jobStatusPath, "utf-8")
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      jobStatusPath,
      JSON.stringify({ status: "stopped", foo: "bar" }, null, 2)
    )
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ success: true })
  })

  it("returns 500 if an error occurs while stopping the job", async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation(() => { throw new Error("fail") })
    const request = makeRequest({ jobId })
    const response = await POST(request as any)
    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data).toEqual({ error: "Failed to stop job" })
  })
})