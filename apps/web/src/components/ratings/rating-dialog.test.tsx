import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { RatingDialog } from "./rating-dialog";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn().mockResolvedValue(false),
  create: vi.fn(),
  getDeletionWarning: vi.fn().mockResolvedValue({
    mayCreateEterisDebt: true,
    settledXp: 50,
  }),
  invalidateQueries: vi.fn(),
}));

vi.mock("@base-ui/react/dialog", () => ({
  Dialog: {
    Backdrop: () => null,
    Close: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Description: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
    Popup: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Portal: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Root: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Title: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: { mutationFn: () => Promise<unknown> }) => ({
    isPending: false,
    mutate: () => options.mutationFn(),
  }),
  useQuery: () => ({
    data: {
      rating: 8,
      review: "Una reseña existente que ya puede haber generado recompensas.",
    },
    isLoading: false,
  }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
    type,
  }: React.PropsWithChildren<{
    disabled?: boolean;
    onClick?: () => void;
    type?: "button" | "submit" | "reset";
  }>) => (
    <button disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => mocks.confirm,
}));
vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
  trackStreakDayCompletion: vi.fn(),
}));
vi.mock("@/lib/orpc", () => ({
  getClientErrorMessage: (_error: unknown, fallback: string) => fallback,
  orpc: {
    streak: { getMine: { queryOptions: () => ({ queryKey: ["streak"] }) } },
  },
  orpcClient: {
    rating: {
      create: mocks.create,
      delete: vi.fn(),
      getDeletionWarning: mocks.getDeletionWarning,
      getUserRating: vi.fn(),
    },
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

it("confirms reward reversal before clearing an existing review", async () => {
  render(<RatingDialog onOpenChange={vi.fn()} open postId="post-1" />);

  fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: /Actualizar/ }));

  await waitFor(() => {
    expect(mocks.getDeletionWarning).toHaveBeenCalledWith({ postId: "post-1" });
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining(
          "50 Account XP y puede dejar tu Billetera Eteris con deuda"
        ),
        title: "Quitar reseña",
      })
    );
  });
  expect(mocks.create).not.toHaveBeenCalled();
});
