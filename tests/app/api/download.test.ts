import { GET } from "../../../app/api/download/route";
import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { cleanupJobFiles } from "@/lib/jobCleanup";

jest.mock("fs/promises");
jest.mock("fs");
jest.mock("@/lib/jobCleanup");
jest.mock("next/server", () => {
  function MockResponse(body: any, init?: any) {
    let _body = body;
    return {
      headers: {
        get: (key: string) => {
          if (key === "Content-Type") return "text/csv";
          if (key === "Content-Disposition")
            return 'attachment; filename="custom.csv"';
          return null;
        },
      },
      arrayBuffer: async () =>
        typeof _body === "string" ? Buffer.from(_body) : _body,
    };
  }
  return {
    NextResponse: Object.assign(MockResponse, {
      json: (data: any, init?: any) => {
        let _headers = new Map<string, string>();
        if (init?.headers) {
          Object.entries(init.headers).forEach(([k, v]) =>
            _headers.set(k, v as string)
          );
        }
        if (!_headers.has("Content-Type")) {
          _headers.set("Content-Type", "application/json");
        }
        return {
          json: async () => data,
          status: init?.status ?? 200,
          headers: {
            get: (key: string) => _headers.get(key) ?? null,
          },
        };
      },
      Response: MockResponse,
    }),
  };
});

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockCleanupJobFiles = cleanupJobFiles as jest.MockedFunction<
  typeof cleanupJobFiles
>;

function createMockRequest(jobId?: string) {
  const url = new URL(
    "http://localhost/api/download" + (jobId ? `?jobId=${jobId}` : "")
  );
  return {
    nextUrl: url,
  } as unknown as NextRequest;
}

describe("GET", () => {
  beforeAll(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(() => {
    (console.error as jest.Mock).mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockCleanupJobFiles.mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns 400 if jobId is missing", async () => {
    const req = createMockRequest();
    const res = await GET(req);
    expect(typeof res.json).toBe("function");
    expect(typeof res.status).toBe("number");
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "Job ID is required" });
  });

  it("returns 404 if job status file does not exist", async () => {
    mockExistsSync.mockReturnValueOnce(false);
    const req = createMockRequest("abc123");
    const res = await GET(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "Job not found" });
  });

  it("returns 400 if job is not completed", async () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ status: "processing" }) as any
    );
    const req = createMockRequest("abc123");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ error: "Job is not completed yet" });
  });

  it("returns 404 if outputPath is missing or file does not exist", async () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ status: "completed" }) as any
    );
    let req = createMockRequest("abc123");
    let res = await GET(req);
    expect(res.status).toBe(404);
    let json = await res.json();
    expect(json).toEqual({ error: "Output file not found" });

    mockExistsSync.mockReturnValueOnce(true);
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        status: "completed",
        outputPath: "/tmp/file.csv",
      }) as any
    );
    mockExistsSync.mockReturnValueOnce(false);
    req = createMockRequest("abc123");
    res = await GET(req);
    expect(res.status).toBe(404);
    json = await res.json();
    expect(json).toEqual({ error: "Output file not found" });
  });

  it("returns the file content with correct headers and triggers cleanup", async () => {
    mockExistsSync.mockImplementation((path) => {
      if (typeof path === "string" && path.endsWith(".json")) return true;
      if (typeof path === "string" && path.endsWith(".csv")) return true;
      return false;
    });
    const jobStatus = {
      status: "completed",
      outputPath: "/tmp/file.csv",
      outputFilename: "custom.csv",
    };
    mockReadFile.mockImplementation((path, encoding) => {
      if (typeof path === "string" && path.endsWith(".json"))
        return Promise.resolve(JSON.stringify(jobStatus));
      if (typeof path === "string" && path.endsWith(".csv"))
        return Promise.resolve(Buffer.from("csv,data"));
      return Promise.reject("not found");
    });
    const req = createMockRequest("abc123");
    const res = await GET(req);
    expect(res).toHaveProperty("headers");
    const contentDisposition = res.headers.get("Content-Disposition");

    expect(contentDisposition).not.toBeNull();
    expect([
      'attachment; filename="custom.csv"',
      'attachment; filename="decoded_vins.csv"',
    ]).toContain(contentDisposition);
    expect(res.headers.get("Content-Type")).toBe("text/csv");
    const arrayBuffer = await res.arrayBuffer();
    expect(Buffer.from(arrayBuffer).toString()).toBe("csv,data");

    jest.runAllTimers();
    expect(mockCleanupJobFiles).toHaveBeenCalledWith("abc123");
  });

  it("returns 500 if an error is thrown", async () => {
    mockExistsSync.mockImplementation(() => {
      throw new Error("fail");
    });
    const req = createMockRequest("abc123");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ error: "Failed to download the file" });
  });
});
