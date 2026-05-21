"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Modal } from "@/components/ui/modal";
import Alert from "@/components/ui/alert/Alert";

import { useUploads } from "../hooks/useUploads";

export default function UploadDashboard() {
  const router = useRouter();
  const {
    uploads,
    uploadParse,
    uploadProgress,
    remove,
  } = useUploads();

  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; fileId: number | null; fileName: string }>({
    isOpen: false,
    fileId: null,
    fileName: "",
  });

  const [fileError, setFileError] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: "",
  });

  const [displayNameInput, setDisplayNameInput] = useState<{ isOpen: boolean; file: File | null; displayName: string }>({
    isOpen: false,
    file: null,
    displayName: "",
  });

  // Tracks the name of the file currently being uploaded so the ghost card can display it.
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);

  // Validate file type - only CSV and Excel files allowed
  const isValidFileType = (file: File): boolean => {
    const validTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    const validExtensions = [".csv", ".xls", ".xlsx"];

    // Check by MIME type
    if (validTypes.includes(file.type)) return true;

    // Check by file extension
    const fileName = file.name.toLowerCase();
    return validExtensions.some((ext) => fileName.endsWith(ext));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    const file = e.target.files[0];

    if (!isValidFileType(file)) {
      setFileError({
        isOpen: true,
        message: `Invalid file type "${file.name}". Please upload only CSV or Excel files (.csv, .xls, .xlsx).`,
      });
      // Reset input
      e.target.value = "";
      return;
    }

    // File is valid, show display name input
    setFileError({ isOpen: false, message: "" });
    setDisplayNameInput({ isOpen: true, file, displayName: "" });
  };

  const handleConfirmUpload = async () => {
    if (displayNameInput.file) {
      const displayName = displayNameInput.displayName.trim() || undefined;
      // Capture the display label before clearing the modal state.
      setUploadingFileName(displayName || displayNameInput.file.name);
      setDisplayNameInput({ isOpen: false, file: null, displayName: "" });
      await uploadParse(displayNameInput.file, displayName);
      setUploadingFileName(null);
    }
  };

  const handleCancelUpload = () => {
    setDisplayNameInput({ isOpen: false, file: null, displayName: "" });
  };

  const handleDeleteClick = (fileId: number, fileName: string) => {
    setDeleteConfirm({ isOpen: true, fileId, fileName });
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirm.fileId !== null) {
      await remove(deleteConfirm.fileId);
      setDeleteConfirm({ isOpen: false, fileId: null, fileName: "" });
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirm({ isOpen: false, fileId: null, fileName: "" });
  };

  return (
    <div>
      <PageBreadcrumb pageTitle="Uploads" />

      <div className="space-y-6">

        {/* Upload Section */}
        <ComponentCard title="Upload Files">
          <div className="space-y-4">

        {/* File Error Alert */}
        {fileError.isOpen && (
          <div className="mb-4">
            <Alert
              variant="error"
              title="Invalid File Type"
              message={fileError.message}
              showLink={false}
            />
          </div>
        )}

        {/* Display Name Modal */}
        <Modal
          isOpen={displayNameInput.isOpen}
          onClose={handleCancelUpload}
          className="max-w-md"
          showBackdrop={true}
        >
          <div className="p-6 pt-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Upload File
            </h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span className="font-medium">Original filename:</span> {displayNameInput.file?.name}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Display Name (Optional)
                </label>
                <input
                  type="text"
                  autoFocus
                  value={displayNameInput.displayName}
                  onChange={(e) =>
                    setDisplayNameInput({
                      ...displayNameInput,
                      displayName: e.target.value,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && uploadProgress === 0) {
                      handleConfirmUpload();
                    }
                  }}
                  placeholder="Leave empty to use original filename"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This is how the file will be displayed in the system. The original filename is always used for file I/O.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCancelUpload}
                  disabled={uploadProgress > 0}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmUpload}
                  disabled={uploadProgress > 0}
                  className="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadProgress > 0 ? `Uploading... ${uploadProgress}%` : "Upload"}
                </button>
              </div>
            </div>
          </div>
        </Modal>

        {/* Dropzone */}
            <label className="flex flex-col items-center justify-center w-full p-10 border-2 border-dashed rounded-xl cursor-pointer hover:border-brand-500 transition">
              <span className="text-gray-600 dark:text-gray-400">
                Drag & drop CSV or Excel files (.csv, .xls, .xlsx) or click to upload
              </span>
              <input
                type="file"
                accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

          </div>
        </ComponentCard>

        {/* Cards Section */}
        <ComponentCard title="Uploaded Files">
          {uploads.length === 0 && uploadProgress === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500 dark:text-gray-400 text-center">No files uploaded yet. Upload a CSV or Excel file to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Ghost card — shown only while an upload is in progress */}
              {uploadProgress > 0 && (
                <div className="flex flex-col p-4 border-2 border-dashed border-brand-300 dark:border-brand-700 rounded-lg bg-brand-50/40 dark:bg-brand-900/10">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm">
                        {uploadingFileName ?? "Uploading…"}
                      </h3>
                      <p className="text-xs text-brand-500 dark:text-brand-400 mt-1">
                        Uploading &amp; parsing…
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 ml-2 flex-shrink-0">
                      {uploadProgress}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Existing upload cards — never show the progress bar */}
              {[...uploads].reverse().map((u) => (
                <div
                  key={u.id}
                  onClick={() => router.push(`/uploads/${u.id}/accounts`)}
                  className="flex flex-col p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg hover:border-brand-500 dark:hover:border-brand-500 transition-all bg-white dark:bg-gray-800 cursor-pointer relative"
                >
                  {/* File Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm" title={u.display_filename || u.filename}>
                        {u.display_filename || u.filename}
                      </h3>
                      {u.display_filename && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate" title={u.filename}>
                          ({u.filename})
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(u.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Delete Button */}
                  <div className="mt-auto flex justify-end pt-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(u.id, u.filename);
                      }}
                      className="px-3 py-2 bg-error-500 hover:bg-error-600 text-white rounded-lg transition text-sm"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-9l-1 1H5v2h14V4z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ComponentCard>

      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteConfirm.isOpen}
        onClose={handleCancelDelete}
        className="max-w-sm"
        showBackdrop={true}
      >
        <div className="p-4">
          <Alert
            variant="error"
            title="Delete File?"
            message={`Are you sure you want to delete "${deleteConfirm.fileName}"? This action cannot be undone.`}
            showLink={false}
          />
          <div className="mt-4 flex gap-2 justify-end">
            <button
              onClick={handleCancelDelete}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              className="px-4 py-2 bg-error-500 hover:bg-error-600 text-white rounded-lg transition"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}