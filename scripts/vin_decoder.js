const { writeFileSync } = require("fs");
const { join, basename } = require("path");
const axios = require("axios");
const xlsx = require("xlsx");
const csvWriter = require("csv-writer").createObjectCsvWriter;
const yargs = require("yargs");

const API_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/";
const DESIRED_FIELDS = [
  "VIN",
  "Make",
  "Model",
  "ModelYear",
  "ErrorCode",
  "ErrorText",
];
const BATCH_SIZE = 50;
const DELAY_BETWEEN_BATCHES = 500; // ms

const argv = yargs
  .option("input", { demandOption: true, type: "string" })
  .option("job-id", { demandOption: true, type: "string" })
  .option("jobs-dir", { demandOption: true, type: "string" })
  .option("outputs-dir", { demandOption: true, type: "string" }).argv;

function updateJobStatus(statusData) {
  const jobStatusPath = join(argv["jobs-dir"], `${argv["job-id"]}.json`);
  writeFileSync(jobStatusPath, JSON.stringify(statusData));
}

async function decodeBatchWithRetry(vins, retries = 3, delay = 5000) {
  const formData = new URLSearchParams({
    format: "json",
    data: vins.join(";"),
  });
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await axios.post(API_URL, formData, { timeout: 60000 });
      if (!resp.data.Results || !Array.isArray(resp.data.Results)) {
        const errorText = `API Error: 'Results' field missing or not a list. Response: ${JSON.stringify(
          resp.data
        ).slice(0, 500)}`;
        return vins.map((vin) => ({
          OriginalVIN: vin,
          ErrorCode: "API_BAD_RESPONSE_STRUCTURE",
          ErrorText: errorText,
        }));
      }
      return resp.data.Results;
    } catch (e) {
      if (e.response && e.response.status === 429) {
        const waitTime = delay * Math.pow(2, attempt);
        await new Promise((res) => setTimeout(res, waitTime));
      } else {
        const errorText = e.response
          ? `HTTP Error: ${e.response.status} - ${e.response.data}`
          : e.message;
        return vins.map((vin) => ({
          OriginalVIN: vin,
          ErrorCode: e.response ? String(e.response.status) : "REQUEST_ERROR",
          ErrorText: errorText,
        }));
      }
    }
  }
  const finalErrorText = `Failed to decode batch after ${retries} retries: ${vins.slice(
    0,
    3
  )}...`;
  return vins.map((vin) => ({
    OriginalVIN: vin,
    ErrorCode: "REQUEST_FAILED_MAX_RETRIES",
    ErrorText: finalErrorText,
  }));
}

(async () => {
  let jobStatus = {
    id: argv["job-id"],
    status: "processing",
    filename: basename(argv.input),
    filePath: argv.input,
    progress: 0,
    currentBatch: 0,
    totalBatches: 0,
    startTime: Date.now(),
    elapsedTime: 0,
    estimatedTimeRemaining: 0,
    outputPath: "",
    outputFilename: "",
    error: "",
  };
  updateJobStatus(jobStatus);

  try {
    const workbook = xlsx.readFile(argv.input);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const oemCodes = new Set();
    data.forEach((row) => {
      if (row[0] && typeof row[0] === "string" && row[0].length >= 2) {
        oemCodes.add(row[0].slice(0, 2).toUpperCase());
      }
    });
    const oemPart = oemCodes.size
      ? Array.from(oemCodes).sort().join("_")
      : "UNKNOWN";
    const outputFilename = `decoded_${oemPart}_VINS_final.csv`;
    const outputPath = join(argv["outputs-dir"], outputFilename);

    const vinColumnIndex = 1;
    const allVins = data
      .map((row) =>
        row[vinColumnIndex]
          ? String(row[vinColumnIndex]).trim().toUpperCase()
          : null
      )
      .filter((vin) => vin && vin.length === 17);
    if (!allVins.length) throw new Error("No valid VINs found in the file.");

    const numBatches = Math.ceil(allVins.length / BATCH_SIZE);
    jobStatus.totalBatches = numBatches;
    updateJobStatus(jobStatus);

    const writer = csvWriter({
      path: outputPath,
      header: DESIRED_FIELDS.map((f) => ({ id: f, title: f })),
    });
    let processedCount = 0;
    const startTime = Date.now();
    const allRows = [];

    for (let i = 0; i < numBatches; i++) {
      const batchVins = allVins.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
      const elapsedTime = (Date.now() - startTime) / 1000;
      jobStatus.currentBatch = i + 1;
      jobStatus.progress = ((i + 1) / numBatches) * 100;
      jobStatus.elapsedTime = elapsedTime;
      if (i > 0) {
        const avgTimePerBatch = elapsedTime / i;
        const remainingBatches = numBatches - i;
        jobStatus.estimatedTimeRemaining = avgTimePerBatch * remainingBatches;
      }
      updateJobStatus(jobStatus);
      const results = await decodeBatchWithRetry(batchVins);
      results.forEach((item, j) => {
        const originalVin = batchVins[j];
        const outputRow = {
          VIN: originalVin,
          Make: "",
          Model: "",
          ModelYear: "",
          ErrorCode: "0",
          ErrorText: "",
        };
        if (item.OriginalVIN) {
          outputRow.ErrorCode = item.ErrorCode || "UNKNOWN_BATCH_ERR";
          outputRow.ErrorText = item.ErrorText || "Batch processing error.";
        } else if (Array.isArray(item)) {
        } else if (typeof item === "object") {
          outputRow.Make = item.Make || "";
          outputRow.Model = item.Model || "";
          outputRow.ModelYear = item.ModelYear || "";
          const errorCode = item["Error Code"] || item.ErrorCode;
          if (errorCode && errorCode !== "0") {
            outputRow.ErrorCode = errorCode;
            outputRow.ErrorText =
              item["Error Text"] ||
              item.AdditionalErrorText ||
              item.Message ||
              "";
          }
        } else {
          outputRow.ErrorCode = "UNHANDLED_API_VIN_STRUCTURE";
          outputRow.ErrorText = `Unhandled API result structure for VIN ${originalVin}. Type: ${typeof item}, Content: ${JSON.stringify(
            item
          ).slice(0, 200)}`;
        }
        outputRow.ErrorText = (outputRow.ErrorText || "")
          .trim()
          .replace(/^;+|;+$/g, "");
        allRows.push(
          Object.fromEntries(DESIRED_FIELDS.map((f) => [f, outputRow[f] || ""]))
        );
      });
      processedCount += batchVins.length;
      if (i < numBatches - 1)
        await new Promise((res) => setTimeout(res, DELAY_BETWEEN_BATCHES));
    }
    await writer.writeRecords(allRows);
    jobStatus.status = "completed";
    jobStatus.progress = 100;
    jobStatus.outputPath = outputPath;
    jobStatus.outputFilename = outputFilename;
    jobStatus.elapsedTime = (Date.now() - startTime) / 1000;
    jobStatus.estimatedTimeRemaining = 0;
    updateJobStatus(jobStatus);
    console.log(`Done! ${processedCount} VINs processed. See ${outputPath}`);
  } catch (e) {
    jobStatus.status = "error";
    jobStatus.error = e.message;
    updateJobStatus(jobStatus);
    console.error("ERROR:", e.message);
  }
})();
