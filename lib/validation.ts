import * as XLSX from "xlsx";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateFileSize(file: File): ValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size exceeds the maximum limit of ${
        MAX_FILE_SIZE / (1024 * 1024)
      }MB`,
    };
  }
  return { isValid: true };
}

export function validateFileType(file: File): ValidationResult {
  const validTypes = [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream".replace,
  ];

  if (!validTypes.includes(file.type)) {
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      return {
        isValid: false,
        error:
          "Invalid file type. Only Excel files (.xlsx, .xls) are supported",
      };
    }
  }

  return { isValid: true };
}

export async function validateExcelContent(
  file: File
): Promise<ValidationResult> {
  try {
    const buffer = await file.arrayBuffer();

    const workbook = XLSX.read(buffer, { type: "array" });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return {
        isValid: false,
        error: "The Excel file does not contain any sheets",
      };
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (!data || data.length === 0) {
      return {
        isValid: false,
        error: "The Excel file is empty",
      };
    }

    const firstRow = data[0] as any[];
    if (!firstRow || firstRow.length < 2) {
      return {
        isValid: false,
        error: "The Excel file must have at least 2 columns (OEM and VIN)",
      };
    }

    let vinCount = 0;
    let invalidVins = 0;

    const rowsToCheck = Math.min(data.length, 100);
    for (let i = 0; i < rowsToCheck; i++) {
      const row = data[i] as any[];
      if (row && row.length >= 2) {
        const potentialVin = String(row[1]).trim().toUpperCase();
        if (potentialVin.length === 17) {
          vinCount++;
          if (!VIN_REGEX.test(potentialVin)) {
            invalidVins++;
          }
        }
      }
    }

    if (vinCount === 0) {
      return {
        isValid: false,
        error: "No potential VINs found in the second column",
      };
    }

    if (invalidVins > vinCount / 2) {
      return {
        isValid: false,
        error:
          "Many entries in the second column do not appear to be valid VINs",
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error:
        "Failed to parse the Excel file. The file may be corrupted or in an unsupported format",
    };
  }
}

export async function validateFile(file: File): Promise<ValidationResult> {
  const sizeResult = validateFileSize(file);
  if (!sizeResult.isValid) {
    return sizeResult;
  }

  const typeResult = validateFileType(file);
  if (!typeResult.isValid) {
    return typeResult;
  }

  return await validateExcelContent(file);
}
