var mockExistsSync = jest.fn();
var mockReadFileSync = jest.fn();
var mockUnlink = jest.fn().mockResolvedValue(undefined);

jest.mock("fs", () => {
  const actualFs = jest.requireActual("fs");
  return {
    ...actualFs,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  };
});

jest.mock("fs/promises", () => {
  return {
    unlink: mockUnlink,
  };
});

let jobCleanup: typeof import("../../lib/jobCleanup");
let deleteFileifExistsMock: jest.Mock;
let consoleErrorSpy: jest.SpyInstance;

import path from "path";

beforeAll(async () => {
  jobCleanup = await import("../../lib/jobCleanup");
});

beforeEach(() => {
  mockExistsSync.mockReset();
  mockReadFileSync.mockReset();
  deleteFileifExistsMock = jest.fn().mockResolvedValue(true);
  if (consoleErrorSpy) consoleErrorSpy.mockRestore();
  consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (consoleErrorSpy) consoleErrorSpy.mockRestore();
});

describe("cleanupJobFiles", () => {
  const jobId = "testjob";
  const rootDir = process.cwd();
  const jobDir = path.join(rootDir, "jobs");
  const outputsDir = path.join(rootDir, "outputs");
  const jobStatusPath = path.join(jobDir, `${jobId}.json`);
  const uploadedFilePathString = "/some/uploaded/file.txt";
  const outputFilePath = path.join(outputsDir, `${jobId}_output.txt`);

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("should attempt to delete job status, uploaded, and output files if job status exists", async () => {
    mockExistsSync.mockImplementation((p: string) => p === jobStatusPath);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ filePath: uploadedFilePathString })
    );

    await jobCleanup.cleanupJobFiles(jobId, deleteFileifExistsMock);

    expect(mockExistsSync).toHaveBeenCalledWith(jobStatusPath);
    expect(mockReadFileSync).toHaveBeenCalledWith(jobStatusPath, "utf-8");

    expect(deleteFileifExistsMock).toHaveBeenCalledWith(uploadedFilePathString);
    expect(deleteFileifExistsMock).toHaveBeenCalledWith(outputFilePath);
    expect(deleteFileifExistsMock).toHaveBeenCalledWith(jobStatusPath);
    expect(deleteFileifExistsMock).toHaveBeenCalledTimes(3);
  });

  it("should attempt to delete only output and job status files if job status does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    await jobCleanup.cleanupJobFiles(jobId, deleteFileifExistsMock);

    expect(mockExistsSync).toHaveBeenCalledWith(jobStatusPath);
    expect(mockReadFileSync).not.toHaveBeenCalled();

    expect(deleteFileifExistsMock).toHaveBeenCalledWith(outputFilePath);
    expect(deleteFileifExistsMock).toHaveBeenCalledWith(jobStatusPath);

    expect(deleteFileifExistsMock).not.toHaveBeenCalledWith(
      uploadedFilePathString
    );
    expect(deleteFileifExistsMock).toHaveBeenCalledTimes(2);
  });

  it("should log an error if reading job status file fails, but still attempt other deletions", async () => {
    mockExistsSync.mockImplementation((p: string) => p === jobStatusPath);
    const readError = new Error("read error");
    mockReadFileSync.mockImplementation(() => {
      throw readError;
    });

    await jobCleanup.cleanupJobFiles(jobId, deleteFileifExistsMock);

    expect(mockExistsSync).toHaveBeenCalledWith(jobStatusPath);
    expect(mockReadFileSync).toHaveBeenCalledWith(jobStatusPath, "utf-8");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Error reading or parsing job status file ${jobStatusPath}:`,
      readError
    );

    expect(deleteFileifExistsMock).toHaveBeenCalledWith(outputFilePath);
    expect(deleteFileifExistsMock).toHaveBeenCalledWith(jobStatusPath);
    expect(deleteFileifExistsMock).not.toHaveBeenCalledWith(
      uploadedFilePathString
    );
    expect(deleteFileifExistsMock).toHaveBeenCalledTimes(2);
  });
});

describe("actual deleteFileifExists (from lib/jobCleanup)", () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockUnlink.mockReset().mockResolvedValue(undefined);
    if (consoleErrorSpy) consoleErrorSpy.mockRestore();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (consoleErrorSpy) consoleErrorSpy.mockRestore();
  });

  it("should call fs.existsSync, then fs/promises.unlink, and return true if file exists", async () => {
    const filePath = "/path/to/existing/file.txt";
    mockExistsSync.mockReturnValue(true);

    const result = await jobCleanup.deleteFileifExists(filePath);

    expect(mockExistsSync).toHaveBeenCalledWith(filePath);
    expect(mockUnlink).toHaveBeenCalledWith(filePath);
    expect(result).toBe(true);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("should call fs.existsSync, not unlink, and return false if file does not exist", async () => {
    const filePath = "/path/to/nonexisting/file.txt";
    mockExistsSync.mockReturnValue(false);

    const result = await jobCleanup.deleteFileifExists(filePath);

    expect(mockExistsSync).toHaveBeenCalledWith(filePath);
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(result).toBe(false);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("should log error and return false if fs/promises.unlink throws", async () => {
    const filePath = "/path/to/problematic/file.txt";
    mockExistsSync.mockReturnValue(true);
    const deleteError = new Error("unlink failed");
    mockUnlink.mockRejectedValueOnce(deleteError);

    const result = await jobCleanup.deleteFileifExists(filePath);

    expect(mockExistsSync).toHaveBeenCalledWith(filePath);
    expect(mockUnlink).toHaveBeenCalledWith(filePath);
    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Error deleting file ${filePath}:`,
      deleteError
    );
  });

  it("should return false for invalid paths without fs operations", async () => {
    const invalidPaths: (string | undefined | null)[] = [
      undefined,
      null,
      "",
      "   ",
    ];
    for (const p of invalidPaths) {
      mockExistsSync.mockReset();
      mockUnlink.mockReset();
      consoleErrorSpy.mockReset();

      const result = await jobCleanup.deleteFileifExists(p);

      expect(result).toBe(false);
      expect(mockExistsSync).not.toHaveBeenCalled();
      expect(mockUnlink).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    }
  });
});
