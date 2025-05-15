import React from "react"

interface StopProcessButtonProps {
  jobId: string
  onStopped?: () => void
}

export function StopProcessButton({ jobId, onStopped }: StopProcessButtonProps) {
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleStop = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/progress/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to stop process")
      } else {
        if (onStopped) onStopped()
      }
    } catch (e) {
      setError("Network error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleStop}
        disabled={loading}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
      >
        {loading ? "Stopping..." : "Stop Process"}
      </button>
      {error && <div className="text-red-500 mt-2">{error}</div>}
    </div>
  )
}
