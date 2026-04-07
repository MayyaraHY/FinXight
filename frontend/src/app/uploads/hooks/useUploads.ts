"use client";

import { useEffect, useState } from "react";
import {
  getUploads,
  deleteUpload,
  deleteAllUploads,
  uploadFile,
  uploadAndParse,
  parseUpload,
} from "@/services/UploadService";
import { Upload } from "@/models/Upload";

export function useUploads() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsingId, setParsingId] = useState<number | null>(null);

  const fetchUploads = async () => {
    try {
      const data = await getUploads();
      setUploads(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch uploads";
      setError(message);
    }
  };

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      try {
        const data = await getUploads();
        // Only update state if the component is still mounted
        if (!controller.signal.aborted) {
          setUploads(data);
          setError(null);
        }
      } catch (err) {
        // Ignore abort errors (component unmounted)
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to fetch uploads";
        if (!controller.signal.aborted) {
          setError(message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    // Cleanup function to prevent state updates on unmounted components
    return () => controller.abort();
  }, []);

  const upload = async (file: File) => {
    setLoading(true);
    await uploadFile(file);
    await fetchUploads();
    setLoading(false);
  };

  const uploadParse = async (file: File) => {
    setLoading(true);
    await uploadAndParse(file);
    await fetchUploads();
    setLoading(false);
  };

  const parse = async (id: number) => {
    setParsingId(id);
    try {
      await parseUpload(id);
      await fetchUploads();
    } finally {
      setParsingId(null);
    }
  };

  const remove = async (id: number) => {
    await deleteUpload(id);
    await fetchUploads();
  };

  const removeAll = async () => {
    await deleteAllUploads();
    await fetchUploads();
  };

  return {
    uploads,
    loading,
    error,
    parsingId,
    fetchUploads,
    upload,
    uploadParse,
    parse,
    remove,
    removeAll,
  };
}