# VIN Decoder App

A modern web application for securely uploading, validating, and decoding VINs (Vehicle Identification Numbers) from Excel files. Built with Next.js, React, and Tailwind CSS.

---

## Features

- **Excel Upload:** Upload `.xlsx` or `.xls` files containing VINs.
- **Validation:** Client and server-side validation of file type, size, and VIN format.
- **Batch Processing:** VINs are processed in batches with real-time progress updates.
- **Download Results:** Download decoded results as a CSV after processing.
- **Stop Process:** Option to stop processing a job in progress.
- **Privacy:** Files are processed securely and deleted after processing.

---

## Tech Stack

- **Frontend:** Next.js, React, Tailwind CSS
- **Backend:** Next.js API Routes, Node.js, Python (for VIN decoding)
- **Testing:** Jest, React Testing Library

---

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm or pnpm
- Python 3 (for VIN decoding script)

### Installation

```sh
npm install
# or
pnpm install
```

### Development

```sh
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

### Running Tests

```sh
npm test
```

---

## Project Structure

```text
app/                # Next.js app directory (pages, API routes)
components/         # React UI components
lib/                # Utility and validation logic
scripts/            # Python and Node.js scripts
uploads/, outputs/  # Temporary file storage (auto-cleaned)
public/             # Static assets
```

---

## API & Processing

- **/api/upload:** Accepts Excel file uploads, validates, and queues for processing.
- **/api/progress:** Server-Sent Events (SSE) for real-time job progress.
- **/api/progress/stop:** Stop a running job.
- **/api/download:** Download processed results.
- **VIN Decoding:** Handled by a Node.js script (`scripts/vin_decoder.js`).

---

## Privacy & Security

- Uploaded files and results are deleted after processing.
- No data is stored permanently.

---

## License

MIT
