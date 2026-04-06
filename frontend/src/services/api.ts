const API_URL = "http://127.0.0.1:8000";

export async function testBackend() {
  const res = await fetch(`${API_URL}/test`);

  if (!res.ok) {
    throw new Error("Backend not reachable");
  }

  return res.json();
}