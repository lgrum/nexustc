import { createContext, use } from "react";
import type { ReactNode } from "react";

import type { PostProps } from "./post-components";

const PostContext = createContext<PostProps | null>(null);

export function PostProvider({
  post,
  children,
}: {
  post: PostProps;
  children: ReactNode;
}) {
  return <PostContext value={post}>{children}</PostContext>;
}

export function usePost(): PostProps {
  const context = use(PostContext);
  if (!context) {
    throw new Error("usePost must be used within a PostProvider");
  }
  return context;
}
