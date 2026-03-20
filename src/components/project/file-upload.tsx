"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, File, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface FileUploadProps {
  onFileChange: (file: File | null) => void;
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
}

export function FileUpload({
  onFileChange,
  accept = ".epub",
  maxSize = 50 * 1024 * 1024, // 50MB default
  disabled = false,
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      const fileName = file.name.toLowerCase();

      // Check extension
      if (!fileName.endsWith(".epub")) {
        return "只支持 EPUB 格式的文件";
      }

      // Check size
      if (file.size > maxSize) {
        const maxSizeMB = maxSize / (1024 * 1024);
        return `文件大小不能超过 ${maxSizeMB}MB`;
      }

      return null;
    },
    [maxSize]
  );

  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled) return;

      if (e.type === "dragenter" || e.type === "dragover") {
        setDragActive(true);
      } else if (e.type === "dragleave") {
        setDragActive(false);
      }
    },
    [disabled]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        const validationError = validateFile(file);

        if (validationError) {
          setError(validationError);
          return;
        }

        setError(null);
        setSelectedFile(file);
        onFileChange(file);
      }
    },
    [disabled, validateFile, onFileChange]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        const validationError = validateFile(file);

        if (validationError) {
          setError(validationError);
          return;
        }

        setError(null);
        setSelectedFile(file);
        onFileChange(file);
      }
    },
    [validateFile, onFileChange]
  );

  const handleRemove = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    onFileChange(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [onFileChange]);

  const handleClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="w-full">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />

      {/* Drop zone */}
      <div
        onClick={handleClick}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          dragActive
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50",
          disabled && "opacity-50 cursor-not-allowed",
          error ? "border-red-300 bg-red-50" : ""
        )}
      >
        {selectedFile ? (
          <div className="flex items-center justify-center gap-3">
            <File className="h-10 w-10 text-blue-500" />
            <div className="flex-1 text-left">
              <p className="font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            {!disabled && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                className="p-1 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-center">
              <Upload className="h-12 w-12 text-gray-400" />
            </div>
            <p className="text-lg font-medium text-gray-700">
              点击或拖拽文件到此处上传
            </p>
            <p className="text-sm text-gray-500">
              支持 EPUB 格式，最大 {maxSize / (1024 * 1024)}MB
            </p>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-2 flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// Upload button component for inline use
interface UploadButtonProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
  className?: string;
}

export function UploadButton({
  onFileSelect,
  accept = ".epub",
  maxSize = 50 * 1024 * 1024,
  disabled = false,
  className,
}: UploadButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      const fileName = file.name.toLowerCase();

      if (!fileName.endsWith(".epub")) {
        return "只支持 EPUB 格式的文件";
      }

      if (file.size > maxSize) {
        const maxSizeMB = maxSize / (1024 * 1024);
        return `文件大小不能超过 ${maxSizeMB}MB`;
      }

      return null;
    },
    [maxSize]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        const validationError = validateFile(file);

        if (validationError) {
          setError(validationError);
          return;
        }

        setError(null);
        onFileSelect(file);
      }
    },
    [validateFile, onFileSelect]
  );

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        <Upload className="h-4 w-4 mr-2" />
        选择文件
      </Button>
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
