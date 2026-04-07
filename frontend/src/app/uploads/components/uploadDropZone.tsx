"use client";

import { useRef } from "react";

type Props = {
  onFile: (file: File) => void;
};

export default function UploadDropzone({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onFile(files[0]);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-6 py-5">
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
          Upload File
        </h3>
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-gray-800 sm:p-6">
        <div className="space-y-6">
          <div
            className="transition border border-gray-300 border-dashed cursor-pointer dark:hover:border-brand-500 dark:border-gray-700 rounded-xl hover:border-brand-500"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer.files);
            }}
          >
            <div className="dropzone rounded-xl border-dashed border-gray-300 p-7 lg:p-10 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".csv,.xlsx"
                onChange={(e) => handleFiles(e.target.files)}
              />

              <div className="dz-message flex flex-col items-center">
                <div className="mb-[22px] flex justify-center">
                  <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    ⬆️
                  </div>
                </div>

                <h4 className="mb-3 font-semibold text-gray-800 text-theme-xl dark:text-white/90">
                  Drag & Drop Files Here
                </h4>

                <span className="text-center mb-5 block w-full max-w-[290px] text-sm text-gray-700 dark:text-gray-400">
                  CSV or Excel files
                </span>

                <span className="font-medium underline text-theme-sm text-brand-500">
                  Browse File
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}