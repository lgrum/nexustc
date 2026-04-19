import type { ChangeEvent } from "react";
import { useState } from "react";

export function useMultipleFileUpload() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = [...event.target.files].filter((file) =>
        file.type.startsWith("image/")
      );

      const uniqueNewFiles = files.filter(
        (newFile) =>
          !selectedFiles.some(
            (existingFile) => existingFile.name === newFile.name
          )
      );

      setSelectedFiles((prevFiles) => [...prevFiles, ...uniqueNewFiles]);

      event.target.value = ""; // Clear input to allow re-selecting same file if removed
    }
  };

  const removeFile = (fileName: string) => {
    setSelectedFiles((prevFiles) =>
      prevFiles.filter((file) => file.name !== fileName)
    );
  };

  return {
    handleFileChange,
    removeFile,
    selectedFiles,
    setSelectedFiles,
  };
}
