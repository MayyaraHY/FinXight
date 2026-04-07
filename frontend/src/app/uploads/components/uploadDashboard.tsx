"use client";

import { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Badge from "@/components/ui/badge/Badge";
import { Modal } from "@/components/ui/modal";
import Alert from "@/components/ui/alert/Alert";

import { useUploads } from "../hooks/useUploads";
import { getPreviewCSV } from "@/services/UploadService";

export default function UploadDashboard() {
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

    // File is valid, proceed with upload
    setFileError({ isOpen: false, message: "" });
    upload(file);
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
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm" title={u.filename}>
                          {u.filename}
                        </h3>
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
                  <div className="flex flex-col gap-2 mt-auto">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        parse(u.id);
                      }}
                      disabled={parsingId === u.id}
                      className="w-full"
                    >
                      {parsingId === u.id ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                          <span>Parsing...</span>
                        </div>
                      ) : (
                        "Parse"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(u.id, u.filename);
                      }}
                      disabled={parsingId === u.id}
                      className="w-full"
                    >
                      Delete
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
        className="max-w-4xl"
        showBackdrop={true}
      >
        <div className="p-6">
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