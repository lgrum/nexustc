import { render } from "@testing-library/react";

import { AppThemeReconciler } from "./app-theme-provider";

const mocks = vi.hoisted(() => ({
  query: { data: undefined, isError: false },
  queryKey: undefined as unknown,
  session: { data: undefined, isPending: true },
  setTheme: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: mocks.setTheme }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => mocks.session },
}));
vi.mock("@/lib/orpc", () => ({
  orpc: {
    appTheme: {
      getMine: { queryOptions: () => ({ queryKey: ["app-theme", "mine"] }) },
    },
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown }) => {
    mocks.queryKey = options.queryKey;
    return mocks.query;
  },
}));

beforeEach(() => {
  mocks.query = { data: undefined, isError: false };
  mocks.queryKey = undefined;
  mocks.session = { data: undefined, isPending: true };
  mocks.setTheme.mockReset();
});

it("preserves the last-known theme while session state is unresolved", () => {
  render(<AppThemeReconciler />);
  expect(mocks.setTheme).not.toHaveBeenCalled();
});

it("applies Default for an anonymous session", () => {
  mocks.session = { data: null, isPending: false };
  render(<AppThemeReconciler />);
  expect(mocks.setTheme).toHaveBeenCalledWith("predeterminado");
});

it("applies the server Effective Theme after reconciliation", () => {
  mocks.session = { data: { user: { id: "user-1" } }, isPending: false };
  mocks.query = {
    data: { effectiveTheme: "ceniza-solar" },
    isError: false,
  };
  render(<AppThemeReconciler />);
  expect(mocks.setTheme).toHaveBeenCalledWith("ceniza-solar");
});

it("retains the local theme on a transient query failure", () => {
  mocks.session = { data: { user: { id: "user-1" } }, isPending: false };
  mocks.query = { data: undefined, isError: true };
  render(<AppThemeReconciler />);
  expect(mocks.setTheme).not.toHaveBeenCalled();
});

it("restores Default when an authenticated session signs out", () => {
  mocks.session = { data: { user: { id: "user-1" } }, isPending: false };
  mocks.query = {
    data: { effectiveTheme: "ceniza-solar" },
    isError: false,
  };
  const view = render(<AppThemeReconciler />);
  expect(mocks.setTheme).toHaveBeenLastCalledWith("ceniza-solar");

  mocks.session = { data: null, isPending: false };
  mocks.query = { data: undefined, isError: false };
  view.rerender(<AppThemeReconciler />);
  expect(mocks.setTheme).toHaveBeenLastCalledWith("predeterminado");
});

it("isolates cached theme state by account ID", () => {
  mocks.session = { data: { user: { id: "user-1" } }, isPending: false };
  const view = render(<AppThemeReconciler />);
  const firstKey = mocks.queryKey;

  mocks.session = { data: { user: { id: "user-2" } }, isPending: false };
  view.rerender(<AppThemeReconciler />);
  expect(mocks.queryKey).not.toEqual(firstKey);
});
