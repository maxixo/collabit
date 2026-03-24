export interface UserModel {
  id: string;
  email: string;
  name: string;
  displayName: string;
  image: string | null;
}

export const mapUserRow = (_row: unknown): UserModel => {
  const row = typeof _row === "object" && _row !== null ? (_row as Record<string, unknown>) : {};

  const id =
    typeof row.id === "string"
      ? row.id
      : typeof row.userId === "string"
        ? row.userId
        : typeof row.user_id === "string"
          ? row.user_id
          : "";

  const email =
    typeof row.email === "string"
      ? row.email
      : typeof row.email_address === "string"
        ? row.email_address
        : typeof row.emailAddress === "string"
          ? row.emailAddress
          : "";

  const rawDisplayName =
    typeof row.displayName === "string"
      ? row.displayName
      : typeof row.display_name === "string"
        ? row.display_name
        : typeof row.name === "string"
          ? row.name
          : typeof row.full_name === "string"
            ? row.full_name
            : "";

  const image =
    typeof row.image === "string"
      ? row.image
      : typeof row.avatar_url === "string"
        ? row.avatar_url
        : typeof row.avatarUrl === "string"
          ? row.avatarUrl
          : null;

  const displayName =
    rawDisplayName.trim() ||
    (email ? email.split("@")[0] : "") ||
    id;

  return {
    id,
    email,
    name: rawDisplayName.trim() || displayName,
    displayName,
    image: image?.trim() || null
  };
};
