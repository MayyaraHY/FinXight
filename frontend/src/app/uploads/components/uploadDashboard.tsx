"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Badge from "@/components/ui/badge/Badge";
import { Modal } from "@/components/ui/modal";
import Alert from "@/components/ui/alert/Alert";

import { useUploads } from "../hooks/useUploads";
import { getPreviewCSV } from "@/services/UploadService";

export default function UploadDashboard() {
  const router = useRouter();
  const {
    uploads,
    upload,
    parse,
    remove,
    parsingId,
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

  const [preview, setPreview] = useState<{
    isOpen: boolean;
    data: null | {
      filename: string;
      headers: string[];
      preview_data: string[][];
      preview_row_count: number;
      total_rows: number;
    };
    loading: boolean;
    error: string | null;
  }>({
    isOpen: false,
    data: null,
    loading: false,
    error: null,
  });

  const [displayNameInput, setDisplayNameInput] = useState<{ isOpen: boolean; file: File | null; displayName: string }>({
    isOpen: false,
    file: null,
    displayName: "",
  });

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
      await upload(displayNameInput.file, displayName);
      setDisplayNameInput({ isOpen: false, file: null, displayName: "" });
    }
  };

  const handleCancelUpload = () => {
    setDisplayNameInput({ isOpen: false, file: null, displayName: "" });
  };

  const getBadgeColor = (status: string) => {
    switch (status) {
      case "processed":
        return "success";
      case "error":
        return "error";
      case "uploaded":
        return "warning";
      default:
        return "primary";
    }
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

  const handlePreview = async (uploadId: number, filename: string) => {
    setPreview({ isOpen: true, data: null, loading: true, error: null });
    try {
      const result = await getPreviewCSV(uploadId);
      setPreview({
        isOpen: true,
        data: result,
        loading: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load preview";
      setPreview({
        isOpen: true,
        data: null,
        loading: false,
        error: message,
      });
    }
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
                  value={displayNameInput.displayName}
                  onChange={(e) =>
                    setDisplayNameInput({
                      ...displayNameInput,
                      displayName: e.target.value,
                    })
                  }
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
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmUpload}
                  className="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition"
                >
                  Upload
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
          {uploads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500 dark:text-gray-400 text-center">No files uploaded yet. Upload a CSV or Excel file to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...uploads].reverse().map((u) => (
                <div
                  key={u.id}
                  onClick={() => handlePreview(u.id, u.filename)}
                  className="flex flex-col p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg hover:border-brand-500 dark:hover:border-brand-500 transition-all bg-white dark:bg-gray-800 cursor-pointer relative"
                >
                  {/* Header Section with Hover Preview */}
                  <div className="group relative">
                    {/* Hover Preview Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 dark:group-hover:bg-black/30 transition-colors rounded pointer-events-none">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center">
                        <svg className="w-8 h-8 text-brand-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <p className="text-xs font-medium text-white">Click to preview</p>
                      </div>
                    </div>

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

                    {/* Status Badge */}
                    <div className="mb-4">
                      <Badge color={getBadgeColor(u.status)} variant="light">
                        {u.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-auto">
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/uploads/${u.id}/accounts`);
                      }}
                      disabled={parsingId === u.id}
                      className="flex-1 bg-brand-500 hover:bg-brand-600 text-white border-none"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                      </svg>
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        parse(u.id);
                      }}
                      disabled={parsingId === u.id}
                      className="flex-1 bg-warning-500 hover:bg-warning-600 text-white border-none"
                    >
                      {parsingId === u.id ? (
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                      ) : (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(u.id, u.filename);
                      }}
                      disabled={parsingId === u.id}
                      className="flex-1 bg-error-500 hover:bg-error-600 text-white border-none"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-9l-1 1H5v2h14V4z" />
                      </svg>
                    </Button>
                  </div>

                  {/* Parsing Progress Bar */}
                  {parsingId === u.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700 rounded-b-lg overflow-hidden">
                      <div className="h-full bg-brand-500 animate-pulse"></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ComponentCard>

      </div>

      {/* CSV Preview Modal */}
      <Modal
        isOpen={preview.isOpen}
        onClose={() => setPreview({ isOpen: false, data: null, loading: false, error: null })}
        className="max-w-2xl"
        showBackdrop={true}
      >
        <div className="p-6 pt-8">
          {preview.loading && (
            <div className="flex justify-center py-8">
              <div className="text-center">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full"></div>
                <p className="mt-2 text-gray-600 dark:text-gray-400">Loading preview...</p>
              </div>
            </div>
          )}

          {preview.error && (
            <Alert
              variant="error"
              title="Preview Error"
              message={preview.error}
              showLink={false}
            />
          )}

          {preview.data && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  {preview.data.filename}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Showing {preview.data.preview_row_count} of {preview.data.total_rows} rows
                </p>
              </div>

              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      {preview.data.headers.map((header, i) => (
                        <th
                          key={i}
                          className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.preview_data.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        {row.map((cell, cellIdx) => (
                          <td
                            key={cellIdx}
                            className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap overflow-hidden overflow-ellipsis max-w-xs"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreview({ isOpen: false, data: null, loading: false, error: null })}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

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
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelDelete}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmDelete}
              className="bg-error-500 hover:bg-error-600 text-white"
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}