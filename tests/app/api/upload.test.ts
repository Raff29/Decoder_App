jest.mock("util", () => ({
  promisify: (fn: any) => () => Promise.resolve({ stdout: "", stderr: "" }),
}));

import { POST } from "../../../app/api/upload/route";
import { NextRequest } from "next/server";
import { MAX_FILE_SIZE } from "@/lib/validation";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";

jest.mock("fs/promises");
jest.mock("fs");
jest.mock("xlsx");
jest.mock("uuid", () => ({ v4: jest.fn() }));
jest.mock("child_process", () => ({
  exec: jest.fn((cmd: string, opts: any, cb: any) =>
    cb?.(null, { stdout: "", stderr: "" })
  ),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: any, init?: any) => ({
      json: async () => data,
      status: init?.status ?? 200,
    }),
  },
}));

const mockWriteFile = fs.writeFile as jest.Mock;
const mockMkdir = fs.mkdir as jest.Mock;
const mockExistsSync = fsSync.existsSync as jest.Mock;
const mockRead = XLSX.read as jest.Mock;
const mockUuid = uuidv4 as jest.Mock;

describe("POST /api/upload", () => {
  beforeAll(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    (console.error as jest.Mock).mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUuid.mockReturnValue("test-job-id");
  });

  function createMockFile(
    buffer: Buffer,
    name = "test.xlsx",
    size = buffer.length
  ): File {
    return {
      arrayBuffer: async () => buffer,
      name,
      size,
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      slice: jest.fn(),
      stream: jest.fn(),
      text: jest.fn(),
      lastModified: Date.now(),
    } as unknown as File;
  }

  function createFormDataWithFile(file: File) {
    return {
      get: (key: string) => (key === "file" ? file : null),
    };
  }

  function createRequestWithFile(file: File) {
    return {
      formData: async () => createFormDataWithFile(file),
    } as unknown as NextRequest;
  }

  it("returns 400 if no file is provided", async () => {
    const req = {
      formData: async () => ({ get: () => null }),
    } as unknown as NextRequest;

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/no file/i);
  });

  it("returns 400 if file size exceeds MAX_FILE_SIZE", async () => {
    const file = createMockFile(
      Buffer.from("a".repeat(10)),
      "test.xlsx",
      MAX_FILE_SIZE + 1
    );
    const req = createRequestWithFile(file);

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/file size exceeds/i);
  });

  it("returns 400 if file is not an Excel file", async () => {
    const file = createMockFile(Buffer.from("dummy"), "test.txt");
    const req = createRequestWithFile(file);

    mockRead.mockImplementation(() => {
      throw new Error("Should not be called");
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/only excel files/i);
  });

  it("returns 400 if Excel file is empty", async () => {
    const file = createMockFile(Buffer.from("dummy"));
    mockRead.mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });
    jest.spyOn(XLSX.utils, "sheet_to_json").mockReturnValue([]);

    const req = createRequestWithFile(file);
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/empty/i);
  });

  it("returns 400 if Excel file has no valid data rows", async () => {
    const file = createMockFile(Buffer.from("dummy"));
    mockRead.mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });
    jest.spyOn(XLSX.utils, "sheet_to_json").mockReturnValue([
      ["header1", "header2"],
      [null, null],
    ]);

    const req = createRequestWithFile(file);
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/no potential vins found in the second column/i);
  });

  it("returns 400 if Excel file has no potential VINs", async () => {
    const file = createMockFile(Buffer.from("dummy"));
    mockRead.mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });
    jest.spyOn(XLSX.utils, "sheet_to_json").mockReturnValue([
      ["row1", "shortvin"],
      ["row2", "123"],
    ]);

    const req = createRequestWithFile(file);
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/no potential vins/i);
  });

  it("returns 400 if many entries in VIN column are invalid", async () => {
    const file = createMockFile(Buffer.from("dummy"));
    mockRead.mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });
    jest.spyOn(XLSX.utils, "sheet_to_json").mockReturnValue([
      ["row1", "INVALIDVIN1234567"],
      ["row2", "INVALIDVIN7654321"],
    ]);
    jest.doMock("@/lib/validation", () => ({
      VIN_REGEX: { test: () => false },
      MAX_FILE_SIZE,
    }));

    const req = createRequestWithFile(file);
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/do not appear to be valid vins/i);
  });

  it("returns 200 and jobId for valid Excel file", async () => {
    const file = createMockFile(Buffer.from("dummy"));
    mockRead.mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });
    jest.spyOn(XLSX.utils, "sheet_to_json").mockReturnValue([
      ["row1", "1HGCM82633A004352"],
      ["row2", "1HGCM82633A004353"],
    ]);
    jest.doMock("@/lib/validation", () => ({
      VIN_REGEX: { test: () => true },
      MAX_FILE_SIZE,
    }));

    const req = createRequestWithFile(file);
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.jobId).toBe("test-job-id");
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("returns 400 on unexpected error", async () => {
    const file = createMockFile(Buffer.from("dummy"));
    mockRead.mockImplementation(() => {
      throw new Error("fail");
    });

    const req = createRequestWithFile(file);
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/failed to parse the excel file/i);
  });
});
