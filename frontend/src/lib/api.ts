const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function redirectToLogin() {
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

export async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

export async function uploadFile(path: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`Upload Error: ${res.status}`);
  return res.json();
}
