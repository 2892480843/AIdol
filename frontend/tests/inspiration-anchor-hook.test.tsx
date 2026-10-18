import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setActiveSession } from "@/lib/api";
import { useInspirationAnchor } from "@/lib/hooks/use-inspiration-anchor";

beforeEach(() => setActiveSession("owner-a", "token-a"));
afterEach(() => act(() => setActiveSession(null, null)));

describe("page-local inspiration anchor", () => {
  it("chooses and explicitly clears an anchor without persisting on remount", () => {
    const first = renderHook(() => useInspirationAnchor());
    expect(first.result.current.anchorId).toBeNull();
    act(() => first.result.current.chooseAnchor("my-top"));
    expect(first.result.current.anchorId).toBe("my-top");
    act(() => first.result.current.chooseAnchor(null));
    expect(first.result.current.anchorId).toBeNull();
    act(() => first.result.current.chooseAnchor("my-top"));
    first.unmount();
    const next = renderHook(() => useInspirationAnchor());
    expect(next.result.current.anchorId).toBeNull();
  });

  it("retains the anchor during a token refresh for the same account", () => {
    const { result } = renderHook(() => useInspirationAnchor());
    act(() => result.current.chooseAnchor("my-top"));
    act(() => setActiveSession("owner-a", "rotated-token"));
    expect(result.current.anchorId).toBe("my-top");
  });

  it("clears the previous account anchor and rejects its late callback", () => {
    const { result } = renderHook(() => useInspirationAnchor());
    act(() => result.current.chooseAnchor("private-a-top"));
    const lateChoose = result.current.chooseAnchor;
    act(() => setActiveSession("owner-b", "token-b"));
    expect(result.current.anchorId).toBeNull();
    act(() => result.current.chooseAnchor("private-b-top"));
    act(() => lateChoose("late-a-top"));
    expect(result.current.anchorId).toBe("private-b-top");
  });

  it.each(["switch-and-return", "sign-out-and-return"] as const)(
    "rejects a stale callback after a batched %s",
    (transition) => {
      const { result } = renderHook(() => useInspirationAnchor());
      act(() => result.current.chooseAnchor("old-private-top"));
      const lateChoose = result.current.chooseAnchor;
      act(() => {
        setActiveSession(
          transition === "switch-and-return" ? "owner-b" : null,
          transition === "switch-and-return" ? "token-b" : null,
        );
        setActiveSession("owner-a", "token-a");
      });
      act(() => lateChoose("late-private-top"));
      expect(result.current.anchorId).toBeNull();
      act(() => result.current.chooseAnchor("new-private-top"));
      expect(result.current.anchorId).toBe("new-private-top");
    },
  );
});
