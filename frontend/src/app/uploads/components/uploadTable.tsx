"use client";

import { Upload } from "@/models/Upload";

type Props = {
  uploads: Upload[];
  onDelete: (id: number) => void;
  onParse: (id: number) => void;
};

export default function UploadTable({
  uploads,
  onDelete,
  onParse,
}: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] mt-6">
      <div className="px-6 py-5">
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
          Uploads
        </h3>
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-gray-800 sm:p-6">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-full">
              <thead className="border-b border-gray-100 dark:border-white/[0.05]">
                <tr>
                  <th className="px-5 py-3 text-start text-theme-xs text-gray-500">
                    ID
                  </th>
                  <th className="px-5 py-3 text-start text-theme-xs text-gray-500">
                    Filename
                  </th>
                  <th className="px-5 py-3 text-start text-theme-xs text-gray-500">
                    Status
                  </th>
                  <th className="px-5 py-3 text-start text-theme-xs text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {uploads.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-4">{u.id}</td>

                    <td className="px-5 py-4">{u.filename}</td>

                    <td className="px-5 py-4">
                      <span className="inline-flex px-2 py-1 rounded-full text-xs bg-success-50 text-success-600">
                        {u.status}
                      </span>
                    </td>

                    <td className="px-5 py-4 flex gap-2">
                      <button
                        onClick={() => onParse(u.id)}
                        className="px-3 py-1 bg-blue-500 text-white rounded"
                      >
                        Parse
                      </button>

                      <button
                        onClick={() => onDelete(u.id)}
                        className="px-3 py-1 bg-red-500 text-white rounded"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {uploads.length === 0 && (
              <p className="p-4 text-center text-gray-400">
                No uploads yet
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}