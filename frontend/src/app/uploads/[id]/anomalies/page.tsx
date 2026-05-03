"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getAnomalies } from "@/services/aiService";
import { Anomaly } from "@/models/ai";

export default function AnomaliesPage() {
  const params = useParams();
  const uploadId = Number(params.id);

  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getAnomalies(uploadId);
        setAnomalies(res.anomalies ?? []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          setNotFound(true);
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [uploadId]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Analyse en cours...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
          Erreur: {error}
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
          <p className="text-yellow-800 dark:text-yellow-300 font-medium mb-2">
            Analyse non encore disponible
          </p>
          <p className="text-yellow-700 dark:text-yellow-400 text-sm">
            L&apos;analyse des anomalies est lancée automatiquement après l&apos;import.
            Si elle est toujours en cours, réessayez dans quelques secondes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
            Détection d&apos;Anomalies
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Analyse IA des comptes — upload #{uploadId}
          </p>
        </div>

        {anomalies.length === 0 ? (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 text-center">
            <p className="text-green-700 dark:text-green-300 font-semibold text-lg mb-1">
              Aucune anomalie détectée
            </p>
            <p className="text-green-600 dark:text-green-400 text-sm">
              Les comptes de cet upload semblent conformes au PCGT tunisien.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-semibold px-3 py-1 rounded-full">
                {anomalies.length} anomalie{anomalies.length > 1 ? "s" : ""} détectée{anomalies.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-4">
              {anomalies.map((anomaly, idx) => (
                <AnomalyCard key={idx} anomaly={anomaly} index={idx + 1} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface AnomalyCardProps {
  anomaly: Anomaly;
  index: number;
}

function AnomalyCard({ anomaly, index }: AnomalyCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border-l-4 border-red-400 dark:border-red-600 p-5">
      <div className="flex items-start gap-4">
        <span className="flex-shrink-0 w-8 h-8 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center text-sm font-bold">
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded">
              {anomaly.compte}
            </span>
          </div>
          <p className="text-gray-800 dark:text-gray-200 font-medium mb-2">
            {anomaly.probleme}
          </p>
          <div className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded p-2">
            <span className="flex-shrink-0 font-semibold">Suggestion:</span>
            <span>{anomaly.suggestion}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
