export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

export interface SignInResponse {
  redirect: boolean;
  token: string | null;
  url?: string | null;
  user: AuthUser;
}

export interface SignUpResponse {
  token: string | null;
  user: AuthUser;
}

export const DEFAULT_AUTH_REDIRECT_PATH = "/editor/recent?workspaceId=default";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

type OAuthRedirectOptions = {
  shareToken?: string;
  shareRequested?: boolean;
  collabRequested?: boolean;
  workspaceId?: string;
  redirectPath?: string | null;
};

export const isTruthyParam = (value: string | null) => {
  if (value === null) {
    return false;
  }
  if (value === "") {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

export const buildOAuthRedirectPath = ({
  shareToken,
  shareRequested,
  collabRequested,
  workspaceId,
  redirectPath
}: OAuthRedirectOptions) => {
  if (redirectPath) {
    return redirectPath;
  }

  if (!shareToken) {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }

  const params = new URLSearchParams();
  params.set("token", shareToken);
  if (shareRequested) {
    params.set("share", "true");
  }
  if (collabRequested) {
    params.set("collab", "true");
  }
  if (workspaceId) {
    params.set("workspaceId", workspaceId);
  }

  return `/editor/recent?${params.toString()}`;
};

const parseJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json()) as T;

  if (!response.ok) {
    const message =
      (data as { message?: string }).message ?? "Authentication request failed";
    throw new Error(message);
  }

  return data;
};

export const signInWithEmail = async (email: string, password: string): Promise<SignInResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password })
  });

  return parseJson<SignInResponse>(response);
};

export const signUpWithEmail = async (
  displayName: string,
  email: string,
  password: string
): Promise<SignUpResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ displayName, email, password })
  });

  return parseJson<SignUpResponse>(response);
};

export const logout = async (): Promise<void> => {
  await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include"
  });
};
