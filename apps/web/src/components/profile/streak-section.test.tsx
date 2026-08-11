import { fireEvent, render, screen } from "@testing-library/react";

import { StreakSection } from "./streak-section";

const state = vi.hoisted(() => ({
  data: {
    atRisk: true,
    available: true,
    bestStreak: 4,
    challenge: {
      availableTargets: [
        { target: 10, xp: 50 },
        { target: 20, xp: 125 },
        { target: 30, xp: 250 },
      ],
      completed: false,
      completedAt: null as string | null,
      completedDays: 0,
      completionOutcome: null as "immediate" | "pending" | null,
      offerAvailable: false,
      remainingDays: null as number | null,
      selectedAt: null as string | null,
      target: null as 10 | 20 | 30 | null,
      upcomingBonus: null as number | null,
    },
    contribution: { completed: false, progress: 0, required: 1 },
    currentStreak: 4,
    deadline: "2026-08-09T03:00:00.000Z",
    initialized: true,
    localDate: "2026-08-08",
    mixedDiscovery: {
      completed: false,
      discovery: { progress: 1, required: 2 },
      reading: { progress: 1, required: 1 },
    },
    partialTimezoneDay: false,
    pendingTimezone: null as string | null,
    pendingXp: false,
    protectedDay: false,
    reading: { completed: false, progress: 2, required: 3 },
    stepUpRequired: false,
    timezone: "America/Argentina/Buenos_Aires",
    timezoneChangeAvailableAt: null as string | null,
    timezoneChangeAllowed: true,
    timezoneChangeEffectiveAt: null as string | null,
    todayXp: 10,
    upcomingReward: { fromDay: 8, xp: 15 },
  },
}));

const mutations = vi.hoisted(() => ({
  completeStepUp: vi.fn(),
  selectChallenge: vi.fn(),
  setTimezone: vi.fn(),
  updateVisibility: vi.fn(),
}));
const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  trackStreakDayCompletion: vi.fn(),
}));
const stepUpCallbacks = vi.hoisted(() => ({
  onError: vi.fn(),
  onSuccess: vi.fn(),
}));
const visibilityCallbacks = vi.hoisted(() => ({
  onError: vi.fn(),
  onSuccess: vi.fn(),
}));
const notifications = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/lib/analytics", () => analytics);
vi.mock("sonner", () => ({ toast: notifications }));

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: {
    challenge?: boolean;
    stepUp?: boolean;
    visibility?: boolean;
  }) => ({
    isPending: false,
    mutate: options.visibility
      ? mutations.updateVisibility
      : options.challenge
        ? mutations.selectChallenge
        : options.stepUp
          ? mutations.completeStepUp
          : mutations.setTimezone,
  }),
  useSuspenseQuery: () => ({ data: state.data }),
}));

vi.mock("@/lib/orpc", () => ({
  getClientErrorMessage: vi.fn((_error, fallback) => fallback),
  orpc: {
    profile: {
      getMySettings: { queryOptions: vi.fn() },
      updateVisibility: {
        mutationOptions: vi.fn((options) => {
          visibilityCallbacks.onError.mockImplementation(options.onError);
          visibilityCallbacks.onSuccess.mockImplementation(options.onSuccess);
          return { ...options, visibility: true };
        }),
      },
    },
    streak: {
      completeStepUp: {
        mutationOptions: vi.fn((options) => {
          stepUpCallbacks.onError.mockImplementation(options.onError);
          stepUpCallbacks.onSuccess.mockImplementation(options.onSuccess);
          return { ...options, stepUp: true };
        }),
      },
      getMine: { queryOptions: vi.fn() },
      selectChallenge: {
        mutationOptions: vi.fn((options) => ({ ...options, challenge: true })),
      },
      setTimezone: { mutationOptions: vi.fn((options) => options) },
    },
  },
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: ({
    onError,
    onSuccess,
  }: {
    onError: () => void;
    onSuccess: (token: string) => void;
  }) => (
    <div>
      <button onClick={() => onSuccess("provider-token")} type="button">
        Completar verificación
      </button>
      <button onClick={onError} type="button">
        Simular error de verificación
      </button>
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  state.data.atRisk = true;
  state.data.challenge.availableTargets = [
    { target: 10, xp: 50 },
    { target: 20, xp: 125 },
    { target: 30, xp: 250 },
  ];
  state.data.challenge.completed = false;
  state.data.challenge.completedAt = null;
  state.data.challenge.completedDays = 0;
  state.data.challenge.completionOutcome = null;
  state.data.challenge.offerAvailable = false;
  state.data.challenge.remainingDays = null;
  state.data.challenge.selectedAt = null;
  state.data.challenge.target = null;
  state.data.challenge.upcomingBonus = null;
  state.data.currentStreak = 4;
  state.data.partialTimezoneDay = false;
  state.data.pendingXp = false;
  state.data.pendingTimezone = null;
  state.data.protectedDay = false;
  state.data.stepUpRequired = false;
  state.data.timezoneChangeAvailableAt = null;
  state.data.timezoneChangeAllowed = true;
  state.data.timezoneChangeEffectiveAt = null;
  state.data.todayXp = 10;
});

it("renders Turnstile only when Step-Up is requested", () => {
  const { rerender } = render(<StreakSection streakPublic={false} />);
  expect(
    screen.queryByRole("button", { name: "Completar verificación" })
  ).toBeNull();

  state.data.stepUpRequired = true;
  rerender(<StreakSection streakPublic={false} />);
  expect(
    screen.getByText(/verificación breve antes de acreditar/i)
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Completar verificación" })
  );
  expect(mutations.completeStepUp).toHaveBeenCalledWith({
    token: "provider-token",
  });

  fireEvent.click(
    screen.getByRole("button", { name: "Simular error de verificación" })
  );
  expect(analytics.trackEvent).toHaveBeenCalledWith(
    "streak_step_up_completed",
    { outcome: "error" }
  );
});

it("lets the account opt into public current streak with accessible Spanish feedback", async () => {
  render(<StreakSection streakPublic={false} />);

  fireEvent.click(
    screen.getByRole("switch", { name: "Mostrar mi Racha actual públicamente" })
  );
  expect(mutations.updateVisibility).toHaveBeenCalledWith({ streak: true });

  await visibilityCallbacks.onSuccess({ visibility: { streak: true } });
  expect(analytics.trackEvent).toHaveBeenCalledWith(
    "streak_visibility_changed",
    { public: true }
  );
  expect(notifications.success).toHaveBeenCalledWith(
    "Privacidad de Racha actualizada"
  );

  visibilityCallbacks.onError(new Error("network"));
  expect(notifications.error).toHaveBeenCalledWith(
    "No pudimos actualizar la privacidad."
  );
});

it("explains persistent daily Pending XP in Spanish", () => {
  state.data.pendingXp = true;
  render(<StreakSection />);

  expect(
    screen.getByText(/XP de este día de Racha está pendiente de revisión/i)
  ).toBeTruthy();
  expect(screen.getByText(/no necesitas repetir la actividad/i)).toBeTruthy();
});

it("records only pass, fail, and error Step-Up outcomes", async () => {
  render(<StreakSection />);

  stepUpCallbacks.onError({ code: "BAD_REQUEST" });
  stepUpCallbacks.onError({ code: "INTERNAL_SERVER_ERROR" });
  await stepUpCallbacks.onSuccess({ completed: true });

  expect(analytics.trackEvent).toHaveBeenCalledWith(
    "streak_step_up_completed",
    { outcome: "fail" }
  );
  expect(analytics.trackEvent).toHaveBeenCalledWith(
    "streak_step_up_completed",
    { outcome: "pass" }
  );
  expect(analytics.trackEvent).toHaveBeenCalledWith(
    "streak_step_up_completed",
    { outcome: "error" }
  );
});

it("offers a dismissible Day 1 challenge while keeping choices available", () => {
  state.data.challenge.offerAvailable = true;
  state.data.currentStreak = 1;
  render(<StreakSection />);

  expect(
    screen.getByRole("dialog", { name: "Elige tu desaf\u00EDo de Racha" })
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.getByRole("button", {
      name: "Elegir desaf\u00EDo de 10 d\u00EDas por 50 XP",
    })
  ).toBeTruthy();
});

it("selects a challenge with keyboard-accessible native buttons", () => {
  render(<StreakSection />);

  fireEvent.click(
    screen.getByRole("button", {
      name: "Elegir desaf\u00EDo de 20 d\u00EDas por 125 XP",
    })
  );
  expect(mutations.selectChallenge).toHaveBeenCalledWith({ target: 20 });
});

it("shows selected progress and reduced-motion completion feedback", () => {
  state.data.challenge.availableTargets = [];
  state.data.challenge.completed = true;
  state.data.challenge.completedAt = "2026-08-08T12:00:00.000Z";
  state.data.challenge.completedDays = 10;
  state.data.challenge.completionOutcome = "immediate";
  state.data.challenge.remainingDays = 0;
  state.data.challenge.selectedAt = "2026-08-01T12:00:00.000Z";
  state.data.challenge.target = 10;
  state.data.challenge.upcomingBonus = 50;
  render(<StreakSection />);

  expect(screen.getByText("10/10 d\u00EDas")).toBeTruthy();
  const feedback = screen.getByRole("status", {
    name: "Desaf\u00EDo de Racha completado",
  });
  expect(feedback.className).toContain("motion-reduce:animate-none");
  expect(
    screen
      .getByRole("switch", { name: "Sonido de celebraci\u00F3n" })
      .getAttribute("aria-checked")
  ).toBe("false");
});

it("describes a completed challenge bonus as Pending XP while under review", () => {
  state.data.challenge.availableTargets = [];
  state.data.challenge.completed = true;
  state.data.challenge.completedAt = "2026-08-08T12:00:00.000Z";
  state.data.challenge.completedDays = 10;
  state.data.challenge.completionOutcome = "pending";
  state.data.challenge.remainingDays = 0;
  state.data.challenge.selectedAt = "2026-08-01T12:00:00.000Z";
  state.data.challenge.target = 10;
  state.data.challenge.upcomingBonus = 50;
  render(<StreakSection />);

  expect(screen.getByText(/50 XP pendientes de revisi\u00F3n/i)).toBeTruthy();
  expect(screen.getByText(/bonus est\u00E1 en revisi\u00F3n/i)).toBeTruthy();
  expect(screen.queryByText(/bonus recibido/i)).toBeNull();
});

it("shows bounded authoritative reading progress without page history", () => {
  render(<StreakSection />);

  expect(
    screen
      .getByRole("progressbar", { name: "Lectura de hoy" })
      .getAttribute("aria-valuenow")
  ).toBe("67");
  expect(screen.getByText("2/3")).toBeTruthy();
  expect(screen.queryByText(/comic-1|página 1/i)).toBeNull();
});

it("shows bounded Mixed Discovery progress without content history", () => {
  render(<StreakSection />);

  expect(
    screen
      .getByRole("progressbar", { name: "Descubrimiento mixto de hoy" })
      .getAttribute("aria-valuenow")
  ).toBe("67");
  expect(screen.getByText("Lectura 1/1 · Acciones 1/2")).toBeTruthy();
  expect(screen.queryByText(/post-1|comic-1/i)).toBeNull();
});

it("explains pending timezone and protected-day continuity in Spanish", () => {
  const format = vi.spyOn(Date.prototype, "toLocaleString");
  state.data.atRisk = false;
  state.data.pendingTimezone = "America/Los_Angeles";
  state.data.protectedDay = true;
  state.data.timezoneChangeAvailableAt = "2026-09-07T12:00:00.000Z";
  state.data.timezoneChangeAllowed = false;
  state.data.timezoneChangeEffectiveAt = "2026-08-09T07:00:00.000Z";
  state.data.todayXp = 0;
  render(<StreakSection />);

  expect(format.mock.calls[0]?.[1]).toMatchObject({
    timeZone: "America/Argentina/Buenos_Aires",
  });
  format.mockRestore();

  expect(screen.getByText("America/Los_Angeles")).toBeTruthy();
  expect(screen.getByText("0 XP")).toBeTruthy();
  expect(screen.getByText(/día protegido/i)).toBeTruthy();
  expect(screen.queryByText(/está en riesgo/i)).toBeNull();
});

it("shows zero XP during the partial destination day", () => {
  state.data.atRisk = false;
  state.data.partialTimezoneDay = true;
  state.data.pendingTimezone = "America/Los_Angeles";
  state.data.timezoneChangeAllowed = false;
  state.data.timezoneChangeEffectiveAt = "2026-08-09T07:00:00.000Z";
  state.data.todayXp = 0;
  render(<StreakSection />);

  expect(screen.getByText("0 XP")).toBeTruthy();
  expect(screen.getByText(/día parcial del cambio/i)).toBeTruthy();
});
