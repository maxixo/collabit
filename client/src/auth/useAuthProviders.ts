import { useEffect, useState } from "react";
import { getAuthProviders } from "../services/auth.service";

export const useAuthProviders = () => {
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    let active = true;
    void getAuthProviders().then((providers) => {
      if (active) setGoogle(providers.google);
    }).catch(() => {
      if (active) setGoogle(false);
    });
    return () => { active = false; };
  }, []);

  return { google };
};
