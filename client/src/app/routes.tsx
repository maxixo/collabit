import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { useAuth } from "../auth/AuthContext";

const SignInPage = lazy(() => import("../pages/SignIn").then((module) => ({ default: module.SignIn })));
const SignUpPage = lazy(() => import("../pages/SignUp").then((module) => ({ default: module.SignUp })));
const EditorPage = lazy(() => import("../pages/Editor").then((module) => ({ default: module.Editor })));
const RecentPage = lazy(() => import("../pages/Recent").then((module) => ({ default: module.Recent })));
const StarredPage = lazy(() => import("../pages/Starred").then((module) => ({ default: module.Starred })));
const SharedPage = lazy(() => import("../pages/Shared").then((module) => ({ default: module.Shared })));
const TrashPage = lazy(() => import("../pages/Trash").then((module) => ({ default: module.Trash })));
const ProfilePage = lazy(() => import("../pages/Profile").then((module) => ({ default: module.Profile })));

type RoutePage = LazyExoticComponent<ComponentType<unknown>>;

const RouteFallback = () => <div className="auth-loading">Loading...</div>;

const withSuspense = (Page: RoutePage) => (
  <Suspense fallback={<RouteFallback />}>
    <Page />
  </Suspense>
);

const ProtectedPage = ({ page: Page }: { page: RoutePage }) => (
  <ProtectedRoute>{withSuspense(Page)}</ProtectedRoute>
);

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

  return withSuspense(EditorPage);
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
      <ProtectedPage page={EditorPage} />
    )
  },
  {
    path: "/editor/recent",
    element: (
      <ProtectedPage page={RecentPage} />
    )
  },
  {
    path: "/editor/starred",
    element: (
      <ProtectedPage page={StarredPage} />
    )
  },
  {
    path: "/editor/shared",
    element: (
      <ProtectedPage page={SharedPage} />
    )
  },
  {
    path: "/editor/trash",
    element: (
      <ProtectedPage page={TrashPage} />
    )
  },
  {
    path: "/profile",
    element: (
      <ProtectedPage page={ProfilePage} />
    )
  },
  {
    path: "/editor/:id",
    element: <ShareEditorRoute />
  },
  {
    path: "/auth/sign-in",
    element: withSuspense(SignInPage)
  },
  {
    path: "/auth/sign-up",
    element: withSuspense(SignUpPage)
  }
]);
