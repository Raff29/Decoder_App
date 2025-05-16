import { unlink } from "fs/promises";
import { readFileSync, existsSync } from "fs";
import path from "path";

export async function deleteFileifExists(
  filePath: string | undefined | null
): Promise<boolean> {
  if (!filePath || typeof filePath !== "string" || filePath.trim() === "") {
    return false;
  }
  try {
    if (existsSync(filePath)) {
      await unlink(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error);
    return false;
  }
}

export async function cleanupJobFiles(
  jobId: string,
  deleteFile: typeof deleteFileifExists = deleteFileifExists
): Promise<void> {
  const rootDir = process.cwd();
  const jobDir = path.join(rootDir, "jobs");
  const outputsDir = path.join(rootDir, "outputs");

  const jobStatusPath = path.join(jobDir, `${jobId}.json`);

  const outputFilePath = path.join(outputsDir, `${jobId}_output.txt`);

  let uploadedFilePath: string | undefined = undefined;

  if (existsSync(jobStatusPath)) {
    try {
      const jobDataString = readFileSync(jobStatusPath, "utf-8");
      const jobData = JSON.parse(jobDataString);

      if (
        jobData &&
        typeof jobData.filePath === "string" &&
        jobData.filePath.trim() !== ""
      ) {
        uploadedFilePath = jobData.filePath;
      }
    } catch (e) {
      console.error(
        `Error reading or parsing job status file ${jobStatusPath}:`,
        e
      );
    }
  }

  const pathsToAttemptDelete = [
    uploadedFilePath,
    outputFilePath,
    jobStatusPath,
  ];

  for (const filePath of pathsToAttemptDelete) {
    if (filePath && typeof filePath === "string" && filePath.trim() !== "") {
      await deleteFile(filePath);
    }
  }
}

export function scheduleCleanup(jobId: string, delayMs = 5 * 60 * 1000): void {
  setTimeout(() => {
    cleanupJobFiles(jobId).catch((error) => {
      console.error(
        `Unhandled error in scheduled cleanup for job ${jobId}:`,
        error
      );
    });
  }, delayMs);
}
