import requests
import csv
import time
import pandas as pd
import json
import os
import argparse
from datetime import datetime

# Parse command line arguments
parser = argparse.ArgumentParser(description='Decode VINs from Excel file')
parser.add_argument('--input', required=True, help='Path to input Excel file')
parser.add_argument('--job-id', required=True, help='Unique job ID')
parser.add_argument('--jobs-dir', required=True, help='Directory for job status files')
parser.add_argument('--outputs-dir', required=True, help='Directory for output files')
args = parser.parse_args()

# Constants
API_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/"
DESIRED_FIELDS = [
    "VIN", "Make", "Model", "ModelYear", "ErrorCode", "ErrorText"
]
BATCH_SIZE = 50
DELAY_BETWEEN_BATCHES = 0.5

# Function to update job status
def update_job_status(status_data):
    job_status_path = os.path.join(args.jobs_dir, f"{args.job_id}.json")
    with open(job_status_path, 'w') as f:
        json.dump(status_data, f)

# Function to decode batch with retry
def decode_batch_with_retry(vins, retries=3, delay=5):
    form_data_payload = {"format": "json", "data": ";".join(vins)}
    for attempt in range(retries):
        try:
            resp = requests.post(API_URL, data=form_data_payload, timeout=60)
            resp.raise_for_status()
            json_response = resp.json()
            if "Results" not in json_response or not isinstance(json_response.get("Results"), list):
                error_text = f"API Error: 'Results' field missing or not a list. Response: {str(json_response)[:500]}"
                print(error_text)
                return [{"OriginalVIN": vin, "ErrorCode": "API_BAD_RESPONSE_STRUCTURE", "ErrorText": error_text} for vin in vins]
            return json_response["Results"]
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 429:
                wait_time = delay * (2**attempt)
                print(
                    f"Rate limit (429). Waiting {wait_time}s (attempt {attempt + 1}/{retries})...")
                time.sleep(wait_time)
            else:
                error_text = f"HTTP Error for batch: {e.response.status_code} - {e.response.text[:200]}"
                print(error_text)
                return [{"OriginalVIN": vin, "ErrorCode": str(e.response.status_code), "ErrorText": error_text} for vin in vins]
        except requests.exceptions.JSONDecodeError as e:
            error_text = f"JSON Decode Error for batch: {e}. Response: {resp.text[:200]}"
            print(error_text)
            return [{"OriginalVIN": vin, "ErrorCode": "JSON_DECODE_ERROR", "ErrorText": error_text} for vin in vins]
        except requests.exceptions.RequestException as e:
            wait_time = delay * (2**attempt)
            error_text = f"Request Exception for batch: {e}. Retrying in {wait_time}s (attempt {attempt + 1}/{retries})..."
            print(error_text)
            time.sleep(wait_time)
    final_error_text = f"Failed to decode batch after {retries} retries: {vins[:3]}..."
    print(final_error_text)
    return [{"OriginalVIN": vin, "ErrorCode": "REQUEST_FAILED_MAX_RETRIES", "ErrorText": final_error_text} for vin in vins]

# Function to chunk list
def chunk_list(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i+size]

# Main execution
try:
    # Initialize job status
    job_status = {
        "id": args.job_id,
        "status": "processing",
        "filename": os.path.basename(args.input),
        "filePath": args.input,
        "progress": 0,
        "currentBatch": 0,
        "totalBatches": 0,
        "startTime": int(time.time() * 1000),
        "elapsedTime": 0,
        "estimatedTimeRemaining": 0,
        "outputPath": "",
        "outputFilename": "",
        "error": ""
    }
    update_job_status(job_status)

    # Read the Excel file
    print(f"Reading VINs from {args.input}...")
    df = pd.read_excel(args.input, header=None)
    
    # Extract OEM codes from the first column
    oem_codes = set()
    if len(df.columns) > 0:
        for oem in df.iloc[:, 0]:
            if isinstance(oem, str) and len(oem) >= 2:
                oem_codes.add(oem[:2].upper())
    
    # Generate output filename
    oem_part = "_".join(sorted(oem_codes)) if oem_codes else "UNKNOWN"
    output_filename = f"decoded_{oem_part}_VINS_final.csv"
    output_path = os.path.join(args.outputs_dir, output_filename)
    
    # Extract VINs from the second column
    vin_column_index = 1
    all_vins = []
    if len(df.columns) > vin_column_index:
        all_vins = [str(vin).strip().upper() for vin in df.iloc[:, vin_column_index].tolist() if str(
            vin).strip() and len(str(vin).strip()) == 17]
    
    print(f"Loaded {len(all_vins)} valid 17-character VINs.")
    if not all_vins:
        raise ValueError("No valid VINs found in the file.")
    
    # Calculate total batches
    num_batches = (len(all_vins) + BATCH_SIZE - 1) // BATCH_SIZE
    job_status["totalBatches"] = num_batches
    update_job_status(job_status)
    
    # Process VINs
    processed_count = 0
    start_time = time.time()
    
    with open(output_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(
            csvfile, fieldnames=DESIRED_FIELDS, extrasaction='ignore')
        writer.writeheader()
        
        for i, batch_vins in enumerate(chunk_list(all_vins, BATCH_SIZE)):
            # Update job status
            current_time = time.time()
            elapsed_time = current_time - start_time
            job_status["currentBatch"] = i + 1
            job_status["progress"] = (i + 1) / num_batches * 100
            job_status["elapsedTime"] = elapsed_time
            
            # Calculate estimated time remaining
            if i > 0:
                avg_time_per_batch = elapsed_time / i
                remaining_batches = num_batches - i
                estimated_time_remaining = avg_time_per_batch * remaining_batches
                job_status["estimatedTimeRemaining"] = estimated_time_remaining
            
            update_job_status(job_status)
            
            # Process batch
            results_from_api_batch = decode_batch_with_retry(batch_vins)
            
            for j, single_vin_api_result_item in enumerate(results_from_api_batch):
                original_vin_for_this_entry = batch_vins[j]
                output_row = {"VIN": original_vin_for_this_entry,
                              "Make": "", "Model": "", "ModelYear": "",
                              "ErrorCode": "0", "ErrorText": ""}
                
                # Case 1: Custom batch-level error
                if isinstance(single_vin_api_result_item, dict) and "OriginalVIN" in single_vin_api_result_item:
                    output_row["ErrorCode"] = single_vin_api_result_item.get(
                        "ErrorCode", "UNKNOWN_BATCH_ERR")
                    output_row["ErrorText"] = single_vin_api_result_item.get(
                        "ErrorText", "Batch processing error.")
                
                # Case 2: API returns list of {"Variable": ..., "Value": ...}
                elif isinstance(single_vin_api_result_item, list):
                    api_reported_error_code_for_vin = "0"
                    api_reported_error_text_list_for_vin = []
                    malformed_item_texts = []
                    for detail_dict in single_vin_api_result_item:
                        if not isinstance(detail_dict, dict):
                            warning_msg = f"Malformed detail_dict for VIN {original_vin_for_this_entry}: {str(detail_dict)[:100]}"
                            malformed_item_texts.append(warning_msg)
                            if output_row["ErrorCode"] == "0":
                                output_row["ErrorCode"] = "MALFORMED_API_DETAIL_ITEM"
                            continue
                        variable_name = detail_dict.get("Variable")
                        variable_value = detail_dict.get("Value", "")
                        if variable_name == "Make":
                            output_row["Make"] = variable_value
                        elif variable_name == "Model":
                            output_row["Model"] = variable_value
                        elif variable_name == "Model Year":
                            output_row["ModelYear"] = variable_value
                        elif variable_name == "Error Code":
                            if variable_value and variable_value != "0":
                                api_reported_error_code_for_vin = variable_value
                        elif variable_name == "Error Text":
                            if variable_value:
                                api_reported_error_text_list_for_vin.append(
                                    variable_value)
                    if api_reported_error_code_for_vin != "0":
                        output_row["ErrorCode"] = api_reported_error_code_for_vin
                        output_row["ErrorText"] = "; ".join(
                            api_reported_error_text_list_for_vin)
                    if malformed_item_texts:
                        existing_text = output_row["ErrorText"]
                        malformed_str = "; ".join(malformed_item_texts)
                        output_row["ErrorText"] = f"{existing_text}; {malformed_str}" if existing_text else malformed_str
                    if output_row["ErrorCode"] == "0":
                        output_row["ErrorText"] = ""
                
                # Case 3: API returns a flat dictionary
                elif isinstance(single_vin_api_result_item, dict):
                    output_row["Make"] = single_vin_api_result_item.get("Make", "")
                    output_row["Model"] = single_vin_api_result_item.get(
                        "Model", "")
                    output_row["ModelYear"] = single_vin_api_result_item.get(
                        "ModelYear", "")
                    api_error_code_in_flat_dict = single_vin_api_result_item.get(
                        "Error Code")
                    if api_error_code_in_flat_dict and api_error_code_in_flat_dict != "0":
                        output_row["ErrorCode"] = api_error_code_in_flat_dict
                        error_text_val = single_vin_api_result_item.get(
                            "Error Text", "")
                        if not error_text_val:
                            error_text_val = single_vin_api_result_item.get(
                                "AdditionalErrorText", "")
                        if not error_text_val:
                            error_text_val = single_vin_api_result_item.get(
                                "Message", "")
                        output_row["ErrorText"] = error_text_val
                    
                    elif output_row["ErrorCode"] == "0":
                        output_row["ErrorText"] = ""
                
                else:  # Case 4: Unhandled structure
                    err_msg = f"Unhandled API result structure for VIN {original_vin_for_this_entry}. Type: {type(single_vin_api_result_item)}, Content: {str(single_vin_api_result_item)[:200]}"
                    print(f"ERROR: {err_msg}")
                    output_row["ErrorCode"] = "UNHANDLED_API_VIN_STRUCTURE"
                    output_row["ErrorText"] = err_msg
                
                output_row["ErrorText"] = output_row["ErrorText"].strip().strip(';')
                
                final_csv_row = {field: output_row.get(
                    field, "") for field in DESIRED_FIELDS}
                writer.writerow(final_csv_row)
            
            processed_count += len(batch_vins)
            if i < num_batches - 1:
                time.sleep(DELAY_BETWEEN_BATCHES)
    
    # Update job status to completed
    job_status["status"] = "completed"
    job_status["progress"] = 100
    job_status["outputPath"] = output_path
    job_status["outputFilename"] = output_filename
    job_status["elapsedTime"] = time.time() - start_time
    job_status["estimatedTimeRemaining"] = 0
    update_job_status(job_status)
    
    print(f"Done! {processed_count} VINs processed. See {output_path}")

except Exception as e:
    # Update job status with error
    error_message = str(e)
    print(f"ERROR: {error_message}")
    
    job_status["status"] = "error"
    job_status["error"] = error_message
    update_job_status(job_status)
