export const MAX_PROFILE_NAME_LENGTH = 80;

export type ValidatedProfileUpdate = {
  name?: string;
  image?: string | null;
};

type ValidationResult =
  | {
      ok: true;
      data: ValidatedProfileUpdate;
    }
  | {
      ok: false;
      message: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const isValidImageUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export const validateProfileUpdatePayload = (payload: unknown): ValidationResult => {
  if (!isRecord(payload)) {
    return { ok: false, message: "Profile update payload must be an object." };
  }

  const data: ValidatedProfileUpdate = {};
  let hasSupportedField = false;

  if (typeof payload.name !== "undefined") {
    hasSupportedField = true;
    if (typeof payload.name !== "string") {
      return { ok: false, message: "name must be a string." };
    }

    const normalizedName = payload.name.trim();
    if (!normalizedName) {
      return { ok: false, message: "name cannot be empty." };
    }
    if (normalizedName.length > MAX_PROFILE_NAME_LENGTH) {
      return {
        ok: false,
        message: `name must be ${MAX_PROFILE_NAME_LENGTH} characters or fewer.`
      };
    }

    data.name = normalizedName;
  }

  if (typeof payload.image !== "undefined") {
    hasSupportedField = true;
    if (payload.image === null) {
      data.image = null;
    } else if (typeof payload.image !== "string") {
      return { ok: false, message: "image must be a URL string or null." };
    } else {
      const normalizedImage = payload.image.trim();
      if (!normalizedImage) {
        data.image = null;
      } else if (!isValidImageUrl(normalizedImage)) {
        return { ok: false, message: "image must be a valid http or https URL." };
      } else {
        data.image = normalizedImage;
      }
    }
  }

  if (!hasSupportedField) {
    return { ok: false, message: "At least one profile field must be provided." };
  }

  return {
    ok: true,
    data
  };
};
