import { act, render, screen } from "@testing-library/react";

import { EngagementPromptBlock } from "./engagement-prompt-block";

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  // oxlint-disable-next-line class-methods-use-this
  observe() {
    // Intentionally empty for tests.
  }
  // oxlint-disable-next-line class-methods-use-this
  disconnect() {
    // Intentionally empty for tests.
  }
  // oxlint-disable-next-line class-methods-use-this
  unobserve() {
    // Intentionally empty for tests.
  }

  emit(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
}

function setDocumentVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

const prompts = [
  {
    id: "prompt-1",
    source: "tag" as const,
    tagTermId: "tag-1",
    text: "Seamos honestos… este conflicto vende más de lo que parece.",
  },
  {
    id: "prompt-2",
    source: "tag" as const,
    tagTermId: "tag-2",
    text: "Nadie lo dice, pero… sin este giro el post cae bastante.",
  },
];

describe(EngagementPromptBlock, () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    setDocumentVisibility("visible");

    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockImplementation(() => ({
        addEventListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
      })),
      writable: true,
    });

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    MockIntersectionObserver.instances = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not render when there are no prompts", () => {
    const { container } = render(<EngagementPromptBlock prompts={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it("renders a single prompt statically", () => {
    render(<EngagementPromptBlock prompts={[prompts[0]!]} />);

    expect(screen.getByText(prompts[0]!.text)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByText(prompts[0]!.text)).toBeTruthy();
  });

  it("rotates prompts after the dwell time and fade duration", () => {
    render(<EngagementPromptBlock prompts={prompts} />);

    expect(screen.getByText(prompts[0]!.text)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByText(prompts[0]!.text).className).toContain("opacity-0");

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByText(prompts[1]!.text)).toBeTruthy();
  });

  it("pauses rotation when the tab is hidden", () => {
    render(<EngagementPromptBlock prompts={prompts} />);

    act(() => {
      setDocumentVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });

    act(() => {
      vi.advanceTimersByTime(7000);
    });

    expect(screen.getByText(prompts[0]!.text)).toBeTruthy();
  });

  it("renders no interactive descendants", () => {
    const { container } = render(<EngagementPromptBlock prompts={prompts} />);
    const interactiveNodes = container.querySelectorAll(
      'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );

    expect(interactiveNodes).toHaveLength(0);
  });
});
