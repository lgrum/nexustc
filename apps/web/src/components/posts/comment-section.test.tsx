import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";

import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";

import { CommentSection } from "./comment-section";
import { PostProvider } from "./post-context";

const mocks = vi.hoisted(() => ({
  getComments: vi.fn(),
  scrollIntoView: vi.fn(),
}));

vi.mock("@/components/comments/comment-content", () => ({
  CommentContent: ({ content }: { content: string }) => <div>{content}</div>,
  useEmojiStickerMaps: () => ({
    emojiMap: new Map(),
    stickerMap: new Map(),
  }),
}));
vi.mock("@/components/comments/edit-comment-dialog", () => ({
  EditCommentDialog: () => null,
}));
vi.mock("@/components/comments/post-comment-form", () => ({
  PostCommentForm: () => null,
}));
vi.mock("@/components/profile/profile-avatar", () => ({
  ProfileAvatar: () => <div />,
}));
vi.mock("@/components/profile/profile-nameplate", () => ({
  ProfileNameplate: ({ user }: { user: { name: string } }) => (
    <span>{user.name}</span>
  ),
}));
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    admin: {
      banUser: vi.fn(),
      checkRolePermission: vi.fn(() => false),
    },
    useSession: () => ({ data: null }),
  },
}));
vi.mock("@/lib/orpc", () => ({
  getClientErrorMessage: (_error: unknown, fallback: string) => fallback,
  orpcClient: {
    post: {
      deleteComment: vi.fn(),
      deleteOwnComment: vi.fn(),
      getComments: mocks.getComments,
      setCommentPinned: vi.fn(),
      toggleCommentLike: vi.fn(),
    },
  },
}));

describe(CommentSection, () => {
  it("loads and scrolls to the exact comment from the URL hash", async () => {
    window.location.hash = "#comment-reply-1";
    HTMLElement.prototype.scrollIntoView = mocks.scrollIntoView;
    mocks.getComments.mockResolvedValue({
      authors: [
        {
          id: "parent-author",
          name: "Autor",
          patronTier: "none",
        },
        {
          id: "reply-author",
          name: "Respuesta",
          patronTier: "none",
        },
      ],
      comments: [
        {
          authorId: "parent-author",
          content: "Comentario principal",
          createdAt: new Date(),
          editedAt: null,
          engagementPromptId: null,
          engagementPromptSource: null,
          engagementPromptText: null,
          id: "parent-1",
          likeCount: 0,
          likedByViewer: false,
          parentId: null,
          pinnedAt: null,
          postId: "post-1",
          updatedAt: new Date(),
        },
        {
          authorId: "reply-author",
          content: "Respuesta exacta",
          createdAt: new Date(),
          editedAt: null,
          engagementPromptId: null,
          engagementPromptSource: null,
          engagementPromptText: null,
          id: "reply-1",
          likeCount: 0,
          likedByViewer: false,
          parentId: "parent-1",
          pinnedAt: null,
          postId: "post-1",
          updatedAt: new Date(),
        },
      ],
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ConfirmDialogProvider>
          <PostProvider post={{ id: "post-1" } as never}>
            <CommentSection
              onSelectedPromptChange={vi.fn()}
              selectedPrompt={null}
            />
          </PostProvider>
        </ConfirmDialogProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(document.querySelector("#comment-reply-1")).toBeTruthy();
      expect(mocks.scrollIntoView).toHaveBeenCalled();
    });
  });
});
