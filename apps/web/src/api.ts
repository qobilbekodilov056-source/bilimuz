export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: { field: string; message: string }[],
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: {
    method?: string;
    data?: unknown;
    form?: FormData;
    signal?: AbortSignal;
    token?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const csrf =
    document.cookie
      .split("; ")
      .find((x) => x.startsWith("testlab_csrf="))
      ?.split("=")[1] || "";
  const response = await fetch(path, {
    method: options.method || "GET",
    signal: options.signal,
    credentials: "same-origin",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-Token": decodeURIComponent(csrf),
      ...(options.form
        ? {}
        : options.data !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      ...(options.token ? { "X-Attempt-Token": options.token } : {}),
      ...options.headers,
    },
    body:
      options.form ||
      (options.data !== undefined ? JSON.stringify(options.data) : undefined),
  });
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(response.status, "Server javobini o‘qib bo‘lmadi");
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error || "So‘rov bajarilmadi",
      data.issues,
    );
  return data as T;
}
export const uuidToken = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
