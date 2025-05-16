"use client";

import type React from "react";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileUp,
  FileText,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  X,
} from "lucide-react";
import { validateFile } from "@/lib/validation";
import { StopProcessButton } from "@/components/StopProcessButton";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "processing" | "success" | "error" | "warning"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadFilename, setDownloadFilename] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const clearFileRef = useRef(false);

  useEffect(() => {
    if (
      clearFileRef.current &&
      (status === "success" || status === "error" || status === "idle")
    ) {
      setFile(null);
      clearFileRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];

      setStatus("idle");
      setErrorMessage("");
      setProgress(0);
      setCurrentBatch(0);
      setTotalBatches(0);
      setDownloadUrl("");

      setIsValidating(true);

      try {
        const validationResult = await validateFile(selectedFile);

        if (!validationResult.isValid) {
          setStatus("warning");
          setErrorMessage(validationResult.error || "Invalid file");
          setFile(null);
        } else {
          setFile(selectedFile);
        }
      } catch (error) {
        setStatus("error");
        setErrorMessage("File validation failed");
        setFile(null);
      } finally {
        setIsValidating(false);
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    setFile(null);
    setStatus("idle");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const processFile = async () => {
    if (!file) return;

    setIsProcessing(true);
    setStatus("processing");
    setProgress(0);
    setCurrentBatch(0);
    setTotalBatches(0);
    setElapsedTime(0);
    setEstimatedTimeRemaining(0);
    setErrorMessage("");
    setDownloadUrl("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || "Failed to upload file");
      }

      const { jobId } = await uploadResponse.json();

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(`/api/progress?jobId=${jobId}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "progress") {
          setCurrentBatch(data.currentBatch);
          setTotalBatches(data.totalBatches);
          setProgress((data.currentBatch / data.totalBatches) * 100);
          setElapsedTime(data.elapsedTime);
          setEstimatedTimeRemaining(data.estimatedTimeRemaining);
        } else if (data.type === "complete") {
          setProgress(100);
          setStatus("success");
          setDownloadUrl(data.downloadUrl);
          setDownloadFilename(data.filename);
          eventSource.close();
        } else if (data.type === "error") {
          setStatus("error");
          setErrorMessage(data.message);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setStatus("error");
        setErrorMessage("Connection to server lost. Please try again.");
        eventSource.close();
      };
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (
      Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
    );
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-24 bg-white">
      <div className="w-full max-w-2xl">
        <div className="flex justify-center mb-8">
          <h1 className="text-4xl font-bold text-[#E31E24]">VIN Decoder</h1>
        </div>

        <Card className="p-6 shadow-lg">
          <div className="space-y-6">
            {!file ? (
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={handleUploadClick}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx,.xls"
                  className="hidden"
                />
                {isValidating ? (
                  <div className="flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500 mb-2"></div>
                    <p className="text-sm text-gray-600">Validating file...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                    <p className="text-sm text-gray-600">
                      {" "}
                      Click to upload Excel file
                    </p>
                    <p className="text-xs text-gray-400 mt-1">(.xlsx, .xls)</p>
                  </>
                )}
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 p-4 flex items-center justify-between border-b border-gray-200">
                  <div className="flex items-center">
                    <div className="bg-[#E31E24] p-2 rounded-md mr-3">
                      <FileText className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveFile}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
                    aria-label="Remove file"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-4 bg-white">
                  <div className="flex items-center text-sm text-gray-600 mb-3">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    <span>File validated successfully</span>
                  </div>
                  <div className="flex justify-center">
                    <Button
                      onClick={processFile}
                      disabled={isProcessing || isValidating}
                      className="bg-[#E31E24] hover:bg-[#C41A1F] text-white w-full"
                    >
                      <FileUp className="mr-2 h-4 w-4" />
                      Process VINs
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex items-start">
              <ShieldCheck className="h-5 w-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-blue-800">Privacy Notice</h3>
                <p className="text-blue-700 text-sm mt-1">
                  Your files are processed securely and are not stored
                  permanently. All uploaded files and generated results are
                  automatically deleted after processing.
                </p>
              </div>
            </div>

            {status === "warning" && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 flex items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-500 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-yellow-800">
                    File validation warning
                  </h3>
                  <p className="text-yellow-700 text-sm mt-1">{errorMessage}</p>
                  <p className="text-yellow-700 text-sm mt-1">
                    Please select a different file.
                  </p>
                </div>
              </div>
            )}

            {status === "processing" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing VINs...</span>
                    <span>
                      {currentBatch}/{totalBatches} batches
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-gray-100 p-3 rounded-md">
                    <p className="text-gray-500 mb-1">Elapsed Time</p>
                    <p className="font-medium">{formatTime(elapsedTime)}</p>
                  </div>
                  <div className="bg-gray-100 p-3 rounded-md">
                    <p className="text-gray-500 mb-1">
                      Estimated Time Remaining
                    </p>
                    <p className="font-medium">
                      {formatTime(estimatedTimeRemaining)}
                    </p>
                  </div>
                </div>

                {eventSourceRef.current && (
                  <div className="flex justify-center mt-4">
                    <StopProcessButton
                      jobId={(() => {
                        const url = eventSourceRef.current?.url;
                        const match = url?.match(/jobId=([\w-]+)/);
                        return match ? match[1] : "";
                      })()}
                      onStopped={() => {
                        eventSourceRef.current?.close();
                        setStatus("idle");
                        setIsProcessing(false);
                        setErrorMessage("");
                        clearFileRef.current = true;
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {status === "success" && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4 flex items-start">
                <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-green-800">
                    Processing complete!
                  </h3>
                  <p className="text-green-700 text-sm mt-1">
                    All VINs have been successfully processed.
                  </p>
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      download={downloadFilename}
                      className="mt-3 inline-flex items-center px-3 py-1.5 border border-green-600 text-xs font-medium rounded-md text-green-700 bg-green-50 hover:bg-green-100"
                    >
                      Download Results
                    </a>
                  )}
                  {}
                  {(clearFileRef.current = true)}
                </div>
              </div>
            )}

            {status === "error" && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-start">
                <AlertCircle className="h-5 w-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-red-800">
                    Processing failed
                  </h3>
                  <p className="text-red-700 text-sm mt-1">
                    {errorMessage ||
                      "An error occurred while processing the file."}
                  </p>
                  <p className="text-red-700 text-sm mt-1">
                    Please check the console for more details.
                  </p>
                  {}
                  {(clearFileRef.current = true)}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
