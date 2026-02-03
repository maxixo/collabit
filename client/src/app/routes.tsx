import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { useAuth } from "../auth/AuthContext";
import { SignIn } from "../pages/SignIn";
import { SignUp } from "../pages/SignUp";
import { Editor } from "../pages/Editor";
import { Recent } from "../pages/Recent";
import { Starred } from "../pages/Starred";
import { Trash } from "../pages/Trash";
import { Profile } from "../pages/Profile";

const isTruthyParam = (value: string | null) => {
  if (value === null) {
    return false;
  }
  if (value === "") {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const normalizeToken = (value: string | null) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const ShareEditorRoute = () => {
  const location = useLocation();
  const { status } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const shareToken = normalizeToken(searchParams.get("token") ?? searchParams.get("shareToken"));
  const shareRequested =
    isTruthyParam(searchParams.get("share")) || isTruthyParam(searchParams.get("shared"));
  const collabRequested =
    isTruthyParam(searchParams.get("collab")) || isTruthyParam(searchParams.get("collaboration"));
  const hasShareContext = Boolean(shareToken || shareRequested || collabRequested);
  const collaborationFlag = collabRequested || shareRequested;

  if (status === "loading") {
    return <div className="auth-loading">Checking session...</div>;
  }

  if (status === "unauthenticated") {
    if (!hasShareContext) {
      return <Navigate to="/auth/sign-in" replace state={{ from: location }} />;
    }

    const redirectParams = new URLSearchParams(location.search);
    redirectParams.set("redirect", `${location.pathname}${location.search}`);
    const redirectSearch = redirectParams.toString();
    return (
      <Navigate
        to={`/auth/sign-in?${redirectSearch}`}
        replace
        state={{ from: location, shareToken, collaboration: collaborationFlag }}
      />
    );
  }

  return <Editor />;
};

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Navigate to="/editor/recent" replace />
      </ProtectedRoute>
    )
  },
  {
    path: "/editor",
    element: (
      <ProtectedRoute>
        <Editor/>
      </ProtectedRoute>
    )
  },
  {
    path: "/editor/recent",
    element: (
      <ProtectedRoute>
        <Recent />
      </ProtectedRoute>
    )
  },
  {
    path: "/editor/starred",
    element: (
      <ProtectedRoute>
        <Starred />
      </ProtectedRoute>
    )
  },
  {
    path: "/editor/trash",
    element: (
      <ProtectedRoute>
        <Trash />
      </ProtectedRoute>
    )
  },
  {
    path: "/profile",
    element: (
      <ProtectedRoute>
        <Profile />
      </ProtectedRoute>
    )
  },
  {
    path: "/editor/:id",
    element: <ShareEditorRoute />
  },
  {
    path: "/auth/sign-in",
    element: <SignIn />
  },
  {
    path: "/auth/sign-up",
    element: <SignUp />
  }
]);
