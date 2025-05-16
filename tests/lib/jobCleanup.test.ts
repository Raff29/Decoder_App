import * as jobCleanup from "../../lib/jobCleanup";
import * as fs from "fs";
import path from "path";

jest.mock("fs");
jest.mock("fs/promises");

describe("cleanupJobFiles", () => {
  const jobId = "testJob";
  const rootDir = process.cwd();
  const jobDir = path.join(rootDir, "jobs");
  const outputsDir = path.join(rootDir, "outputs");
  const jobStatusPath = path.join(jobDir, `${jobId}.json`);
  const outputFilePath = path.join(outputsDir, `${jobId}_output.txt`);
  const uploadedFilePath = "/some/uploaded/file.txt";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should delete uploaded file, output file, and job status file if all exist and uploadedFilePath is present", async () => {
    (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      return [jobStatusPath, outputFilePath, uploadedFilePath].includes(
        filePath
      );
    });

    (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath === jobStatusPath) {
        return JSON.stringify({ filePath: uploadedFilePath });
      }
      return "";
    });

    const deleteFileifExists = jest.fn().mockResolvedValue(true);
    jest
      .spyOn(jobCleanup, "deleteFileifExists")
      .mockImplementation(deleteFileifExists);

    await jobCleanup.cleanupJobFiles(jobId, deleteFileifExists);

    expect(fs.existsSync).toHaveBeenCalledWith(jobStatusPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(jobStatusPath, "utf-8");
    expect(deleteFileifExists).toHaveBeenCalledWith(uploadedFilePath);
    expect(deleteFileifExists).toHaveBeenCalledWith(outputFilePath);
    expect(deleteFileifExists).toHaveBeenCalledWith(jobStatusPath);
    expect(deleteFileifExists).toHaveBeenCalledTimes(3);
  });

  it("should skip uploadedFilePath if not present in job status file", async () => {
    (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      return [jobStatusPath, outputFilePath].includes(filePath);
    });

    (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath === jobStatusPath) {
        return JSON.stringify({});
      }
      return "";
    });

    const deleteFileifExists = jest.fn().mockResolvedValue(true);
    jest
      .spyOn(jobCleanup, "deleteFileifExists")
      .mockImplementation(deleteFileifExists);

    await jobCleanup.cleanupJobFiles(jobId, deleteFileifExists);

    expect(deleteFileifExists).not.toHaveBeenCalledWith(undefined);
    expect(deleteFileifExists).toHaveBeenCalledWith(outputFilePath);
    expect(deleteFileifExists).toHaveBeenCalledWith(jobStatusPath);
    expect(deleteFileifExists).toHaveBeenCalledTimes(2);
  });

  it("should skip all deletions if job status file does not exist", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const deleteFileifExists = jest.fn().mockResolvedValue(true);
    jest
      .spyOn(jobCleanup, "deleteFileifExists")
      .mockImplementation(deleteFileifExists);

    await jobCleanup.cleanupJobFiles(jobId, deleteFileifExists);

    expect(deleteFileifExists).toHaveBeenCalledWith(outputFilePath);
    expect(deleteFileifExists).toHaveBeenCalledWith(jobStatusPath);
    expect(deleteFileifExists).toHaveBeenCalledTimes(2);
  });

  it("should handle invalid JSON in job status file gracefully", async () => {
    (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      return [jobStatusPath, outputFilePath].includes(filePath);
    });

    (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath === jobStatusPath) {
        throw new Error("Invalid JSON");
      }
      return "";
    });

    const deleteFileifExists = jest.fn().mockResolvedValue(true);
    jest
      .spyOn(jobCleanup, "deleteFileifExists")
      .mockImplementation(deleteFileifExists);

    await jobCleanup.cleanupJobFiles(jobId, deleteFileifExists);

    expect(deleteFileifExists).not.toHaveBeenCalledWith(undefined);
    expect(deleteFileifExists).toHaveBeenCalledWith(outputFilePath);
    expect(deleteFileifExists).toHaveBeenCalledWith(jobStatusPath);
    expect(deleteFileifExists).toHaveBeenCalledTimes(2);
  });

  it("should not attempt to delete files with empty or invalid paths", async () => {
    (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      return [jobStatusPath, outputFilePath].includes(filePath);
    });

    (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath === jobStatusPath) {
        return JSON.stringify({ filePath: "   " });
      }
      return "";
    });

    const deleteFileifExists = jest.fn().mockResolvedValue(true);
    jest
      .spyOn(jobCleanup, "deleteFileifExists")
      .mockImplementation(deleteFileifExists);

    await jobCleanup.cleanupJobFiles(jobId, deleteFileifExists);

    expect(deleteFileifExists).not.toHaveBeenCalledWith("   ");
    expect(deleteFileifExists).toHaveBeenCalledWith(outputFilePath);
    expect(deleteFileifExists).toHaveBeenCalledWith(jobStatusPath);
    expect(deleteFileifExists).toHaveBeenCalledTimes(2);
  });
});
