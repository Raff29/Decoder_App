const fs = require("fs");
const fsPromises = require("fs/promises");
const { scheduleCleanup } = require("@/lib/jobCleanup");
const { GET } = require("../../../app/api/progress/route");
jest.mock("fs/promises", () => ({
  readFile: jest.fn(),
}));
jest.mock("fs", () => ({
  existsSync: jest.fn(),
}));
jest.mock("path", () => ({
  join: jest.fn((...args: string[]) => args.join("/")),
}));
jest.mock("@/lib/jobCleanup", () => ({
  scheduleCleanup: jest.fn(),
}));

global.ReadableStream = require("web-streams-polyfill").ReadableStream;
global.TextEncoder = require("util").TextEncoder;
global.TextDecoder = require("util").TextDecoder;

function createMockRequest({
  jobId,
  signal,
}: { jobId?: string; signal?: AbortSignal } = {}) {
  return {
    nextUrl: {
      searchParams: {
        get: (key: string) => (key === "jobId" ? jobId : null),
      },
    },
    signal: signal || new AbortController().signal,
  } as any;
}

async function readStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value);
  }
  return result;
}

describe("GET", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 if jobId is missing", async () => {
    const req = createMockRequest({});
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ error: "Job ID is required" });
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("returns error if job file does not exist", async () => {
    fs.existsSync.mockReturnValue(false);
    const req = createMockRequest({ jobId: "abc123" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const body = await readStream(res.body as any);
    expect(body).toContain('"type":"error"');
    expect(body).toContain('"Job not found"');
  });

  it("streams progress updates if job is processing", async () => {
    fs.existsSync.mockReturnValue(true);
    fsPromises.readFile
      .mockResolvedValueOnce(
        JSON.stringify({
          status: "processing",
          currentBatch: 2,
          totalBatches: 5,
          progress: 40,
          elapsedTime: 10,
          estimatedTimeRemaining: 15,
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          status: "completed",
          outputFilename: "result.csv",
        })
      );
    const req = createMockRequest({ jobId: "abc123" });
    jest.spyOn(global, "setInterval").mockImplementation((cb: any) => {
      cb();
      return 1 as any;
    });
    const res = await GET(req);
    const body = await readStream(res.body as any);
    expect(body).toContain('"type":"progress"');
    expect(body).toContain('"currentBatch":2');
    expect(body).toContain('"totalBatches":5');
    expect(body).toContain('"progress":40');
    expect(body).toContain('"elapsedTime":10');
    expect(body).toContain('"estimatedTimeRemaining":15');
    expect(body).toContain('"type":"complete"');
    expect(body).toContain('"filename":"result.csv"');
  });

  it("streams complete event if job is completed", async () => {
    fs.existsSync.mockReturnValue(true);
    fsPromises.readFile.mockResolvedValue(
      JSON.stringify({
        status: "completed",
        outputFilename: "result.csv",
      })
    );
    const req = createMockRequest({ jobId: "abc123" });
    jest.spyOn(global, "setInterval").mockImplementation(() => 1 as any);
    const res = await GET(req);
    const body = await readStream(res.body as any);
    expect(body).toContain('"type":"complete"');
    expect(body).toContain('"downloadUrl":"/api/download?jobId=abc123"');
    expect(body).toContain('"filename":"result.csv"');
    expect(scheduleCleanup).toHaveBeenCalledWith("abc123", 5 * 60 * 1000);
  });

  it("streams error event if job status is error", async () => {
    fs.existsSync.mockReturnValue(true);
    fsPromises.readFile.mockResolvedValue(
      JSON.stringify({
        status: "error",
        error: "Something went wrong",
      })
    );
    const req = createMockRequest({ jobId: "abc123" });
    jest.spyOn(global, "setInterval").mockImplementation(() => 1 as any);
    const res = await GET(req);
    const body = await readStream(res.body as any);
    expect(body).toContain('"type":"error"');
    expect(body).toContain('"Something went wrong"');
  });
});
