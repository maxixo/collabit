import React, { createContext, useContext, useReducer, type Dispatch, type Reducer } from "react";

// Types
export interface Collaborator {
  id: string;
  name: string;
  avatar?: string;
  color: string;
}

export interface CursorPosition {
  userId: string;
  position: number;
  range?: {
    from: number;
    to: number;
  };
}

export interface PresenceState {
  collaborators: Collaborator[];
  cursorPositions: Map<string, CursorPosition>;
}

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
  ownerId: string;
  workspaceId: string;
  isStarred: boolean;
}

export interface AppContextValue {
  activeDocumentId: string | null;
  recentDocuments: DocumentSummary[];
  connectionStatus: "online" | "offline" | "reconnecting";
  saveStatus: "saved" | "saving" | "error" | "conflict";
  presence: PresenceState;
  dispatch: Dispatch<AppAction>;
}

type AppAction =
  | { type: "SET_ACTIVE_DOCUMENT"; payload: string | null }
  | { type: "SET_RECENT_DOCUMENTS"; payload: DocumentSummary[] }
  | { type: "ADD_RECENT_DOCUMENT"; payload: DocumentSummary }
  | { type: "UPDATE_RECENT_DOCUMENT"; payload: DocumentSummary }
  | { type: "SET_DOCUMENT_STAR"; payload: { id: string; isStarred: boolean } }
  | { type: "SET_CONNECTION_STATUS"; payload: "online" | "offline" | "reconnecting" }
  | { type: "SET_SAVE_STATUS"; payload: "saved" | "saving" | "error" | "conflict" }
  | { type: "SET_PRESENCE"; payload: PresenceState }
  | { type: "ADD_COLLABORATOR"; payload: Collaborator }
  | { type: "REMOVE_COLLABORATOR"; payload: string }
  | { type: "UPDATE_CURSOR"; payload: { userId: string; position: CursorPosition } }
  | { type: "RESET_STATE" };

// Initial State
const initialState: AppContextValue = {
  activeDocumentId: null,
  recentDocuments: [],
  connectionStatus: "online",
  saveStatus: "saved",
  presence: {
    collaborators: [],
    cursorPositions: new Map()
  },
  dispatch: () => {}
};

// Reducer
const appReducer: Reducer<AppContextValue, AppAction> = (state, action) => {
  switch (action.type) {
    case "SET_ACTIVE_DOCUMENT":
      return { ...state, activeDocumentId: action.payload };
    
    case "SET_RECENT_DOCUMENTS":
      return { ...state, recentDocuments: action.payload };
    
    case "ADD_RECENT_DOCUMENT":
      return {
        ...state,
        recentDocuments: [action.payload, ...state.recentDocuments.filter(doc => doc.id !== action.payload.id)]
      };
    
    case "UPDATE_RECENT_DOCUMENT":
      return {
        ...state,
        recentDocuments: state.recentDocuments.map(doc =>
          doc.id === action.payload.id ? action.payload : doc
        )
      };

    case "SET_DOCUMENT_STAR":
      return {
        ...state,
        recentDocuments: state.recentDocuments.map(doc =>
          doc.id === action.payload.id
            ? { ...doc, isStarred: action.payload.isStarred }
            : doc
        )
      };
    
    case "SET_CONNECTION_STATUS":
      return { ...state, connectionStatus: action.payload };
    
    case "SET_SAVE_STATUS":
      return { ...state, saveStatus: action.payload };
    
    case "SET_PRESENCE":
      return { ...state, presence: action.payload };
    
    case "ADD_COLLABORATOR":
      return {
        ...state,
        presence: {
          ...state.presence,
          collaborators: [...state.presence.collaborators.filter(c => c.id !== action.payload.id), action.payload]
        }
      };
    
    case "REMOVE_COLLABORATOR":
      const cursorPositionsAfterRemoval = new Map(state.presence.cursorPositions);
      cursorPositionsAfterRemoval.delete(action.payload);
      return {
        ...state,
        presence: {
          ...state.presence,
          collaborators: state.presence.collaborators.filter(c => c.id !== action.payload),
          cursorPositions: cursorPositionsAfterRemoval
        }
      };
    
    case "UPDATE_CURSOR":
      const cursorPositionsAfterUpdate = new Map(state.presence.cursorPositions);
      cursorPositionsAfterUpdate.set(action.payload.userId, action.payload.position);
      return {
        ...state,
        presence: {
          ...state.presence,
          cursorPositions: cursorPositionsAfterUpdate
        }
      };
    
    case "RESET_STATE":
      return initialState;
    
    default:
      return state;
  }
};

// Context
const AppContext = createContext<AppContextValue | undefined>(undefined);

// Provider Component
export const AppProvider = ({ children }: { children: any }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return React.createElement(AppContext.Provider, { value: { ...state, dispatch } }, children);
};

// Custom Hook
export const useAppStore = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppStore must be used within an AppProvider");
  }
  return context;
};

// Action Creators (convenience functions)
export const actions = {
  setActiveDocument: (id: string | null) => ({ type: "SET_ACTIVE_DOCUMENT" as const, payload: id }),
  setRecentDocuments: (docs: DocumentSummary[]) => ({ type: "SET_RECENT_DOCUMENTS" as const, payload: docs }),
  addRecentDocument: (doc: DocumentSummary) => ({ type: "ADD_RECENT_DOCUMENT" as const, payload: doc }),
  updateRecentDocument: (doc: DocumentSummary) => ({ type: "UPDATE_RECENT_DOCUMENT" as const, payload: doc }),
  setDocumentStar: (payload: { id: string; isStarred: boolean }) => ({ type: "SET_DOCUMENT_STAR" as const, payload }),
  setConnectionStatus: (status: "online" | "offline" | "reconnecting") => ({ type: "SET_CONNECTION_STATUS" as const, payload: status }),
  setSaveStatus: (status: "saved" | "saving" | "error" | "conflict") => ({ type: "SET_SAVE_STATUS" as const, payload: status }),
  setPresence: (presence: PresenceState) => ({ type: "SET_PRESENCE" as const, payload: presence }),
  addCollaborator: (collaborator: Collaborator) => ({ type: "ADD_COLLABORATOR" as const, payload: collaborator }),
  removeCollaborator: (userId: string) => ({ type: "REMOVE_COLLABORATOR" as const, payload: userId }),
  updateCursor: (userId: string, position: CursorPosition) => ({ type: "UPDATE_CURSOR" as const, payload: { userId, position } }),
  resetState: () => ({ type: "RESET_STATE" as const })
};
