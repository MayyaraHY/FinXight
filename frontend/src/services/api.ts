import { BACKEND_URL } from "@/lib/apiUrls";

const API_URL = BACKEND_URL;

// `/test` is one of the two intentionally-public backend endpoints
// (declared in backend/app/main.py). Plain fetch is correct here —
// no Authorization header is required.
export async function testBackend() {
  const res = await fetch(`${API_URL}/test`);

  if (!res.ok) {
    throw new Error("Backend not reachable");
  }

  return res.json();
}
