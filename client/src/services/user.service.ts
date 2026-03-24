export const MAX_PROFILE_NAME_LENGTH = 80;

export interface ProfileUser {
  id: string;
  email?: string;
  name?: string;
  image?: string | null;
}

type ProfileUpdateInput = {
  name: string;
  image: string;
};

type ValidatedProfileInput =
  | {
      ok: true;
      data: {
        name: string;
        image: string | null;
      };
    }
  | {
      ok: false;
      message: string;
    };

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:4000";

const parseJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json()) as T;

  if (!response.ok) {
    const message = (data as { message?: string }).message ?? "User request failed";
    throw new Error(message);
  }

  return data;
};

const isValidUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export const validateProfileUpdate = (
  input: ProfileUpdateInput
): ValidatedProfileInput => {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, message: "Display name is required." };
  }
  if (name.length > MAX_PROFILE_NAME_LENGTH) {
    return {
      ok: false,
      message: `Display name must be ${MAX_PROFILE_NAME_LENGTH} characters or fewer.`
    };
  }

  const image = input.image.trim();
  if (image && !isValidUrl(image)) {
    return { ok: false, message: "Avatar URL must be a valid http or https URL." };
  }

  return {
    ok: true,
    data: {
      name,
      image: image || null
    }
  };
};

export const updateProfile = async (input: {
  name: string;
  image: string | null;
}): Promise<ProfileUser> => {
  const response = await fetch(`${API_BASE_URL}/api/users/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input)
  });

  const data = await parseJson<{ user: ProfileUser }>(response);
  return data.user;
};
