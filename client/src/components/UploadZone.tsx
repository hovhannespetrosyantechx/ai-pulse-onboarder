import { useRef, useState } from "react"
import { Upload } from "lucide-react"
import "./UploadZone.css"

interface UploadZoneProps {
  onUploadComplete: () => void
}

const ACCEPTED_TYPES = ["application/pdf", "text/plain", "text/markdown"]
const MAX_SIZE_MB = 10

export default function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [isDragging, setIsDragging]   = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const dragCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Only PDF, TXT, and MD files are supported."
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File must be under ${MAX_SIZE_MB}MB.`
    }
    return null
  }

  const uploadFile = async (file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("http://localhost:3001/api/documents", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Upload failed")
      }

      onUploadComplete()  // triggers mutate() in App.tsx
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setIsUploading(false)
    }
  }

  // Drag handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    setIsDragging(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()  // required — without this, onDrop never fires
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  // Browse button handler
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ""  // reset so the same file can be re-uploaded if needed
  }

  return (
    <div
      className={`upload-zone ${isDragging ? "dragging" : ""} ${isUploading ? "uploading" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md"
        onChange={handleFileInput}
        style={{ display: "none" }}
      />

      <div className="upload-zone-content">
        {isUploading ? (
          <>
            <div className="upload-spinner" />
            <p className="upload-label">Uploading…</p>
          </>
        ) : (
          <>
            <Upload size={24} className="upload-icon" />
            <p className="upload-label">
              Drag and drop a file here, or{" "}
              <button
                className="upload-browse-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                browse
              </button>
            </p>
            <p className="upload-hint">PDF, TXT, MD · max 10MB</p>
          </>
        )}
      </div>

      {error && <p className="upload-error">{error}</p>}
    </div>
  )
}
