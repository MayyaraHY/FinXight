"use client";

import { useEffect, useState } from "react";
import { testBackend } from "@/services/api";

type TestResponse = {
  message: string;
};

export default function TestPage() {
  const [data, setData] = useState<TestResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    testBackend()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h1>Connection Test</h1>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}