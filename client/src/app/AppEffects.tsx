import { useStarSync } from "../hooks/useStarSync";
import { useDocumentSync } from "../hooks/useDocumentSync";

export const AppEffects = () => {
  useDocumentSync();
  useStarSync();
  return null;
};
