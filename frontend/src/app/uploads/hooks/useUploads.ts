"use client";

import { useEffect, useState } from "react";
import {
  getUploads,
  deleteUpload,
  deleteAllUploads,
  uploadFile,
  uploadAndParseWithProgress,
  parseUpload,
  patchUploadMetadata,
  UploadMetadata,
} from "@/services/UploadService";
import { Upload } from "@/models/Upload";

/** Newest first: by created_at desc, falling back to id desc. */
function sortByNewest(uploads: Upload[]): Upload[] {
  return [...uploads].sort((a, b) => {
    const diff =
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return diff !== 0 ? diff : b.id - a.id;
  });
}

export function useUploads() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsingId, setParsingId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const fetchUploads = async () => {
    try {
      const data = await getUploads();
      setUploads(sortByNewest(data));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Échec du chargement des fichiers";
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
          setUploads(sortByNewest(data));
          setError(null);
        }
      } catch (err) {
        // Ignore abort errors (component unmounted)
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        const message = err instanceof Error ? err.message : "Échec du chargement des fichiers";
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

  const upload = async (file: File, displayName?: string) => {
    setLoading(true);
    await uploadFile(file, displayName);
    await fetchUploads();
    setLoading(false);
  };

  const uploadParse = async (file: File, metadata?: UploadMetadata) => {
    setLoading(true);
    setUploadProgress(0);
    try {
      await uploadAndParseWithProgress(file, metadata, (progress) => {
        setUploadProgress(progress);
      });
      await fetchUploads();
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
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

  const patch = async (
    id: number,
    data: {
      display_filename?: string | null;
      company_id?: number | null;
      period_year?: number | null;
      period_month?: number | null;
    }
  ) => {
    await patchUploadMetadata(id, data);
    await fetchUploads();
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
    uploadProgress,
    fetchUploads,
    upload,
    uploadParse,
    parse,
    patch,
    remove,
    removeAll,
  };
}