import { createBrowserRouter, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { SignIn } from "../pages/SignIn";
import { SignUp } from "../pages/SignUp";
import { Editor } from "../pages/Editor";
import { Recent } from "../pages/Recent";
import { Starred } from "../pages/Starred";

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
    path: "/editor/:id",
    element: (
      <ProtectedRoute>
        <Editor />
      </ProtectedRoute>
    )
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
