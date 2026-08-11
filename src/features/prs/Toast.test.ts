import { describe, expect, it } from "vitest";
import type { ToastItem } from "./Toast";
import { pushToast } from "./Toast";

function toast(id: number, text = `toast ${id}`): ToastItem {
  return { id, text, kind: "ok" };
}

describe("pushToast (U12: kleine toast-stack)", () => {
  it("voegt een toast toe aan een lege stack", () => {
    expect(pushToast([], toast(1))).toEqual([toast(1)]);
  });

  it("stapelt meerdere toasts in aankomstvolgorde", () => {
    const stack = pushToast(pushToast([], toast(1)), toast(2));
    expect(stack).toEqual([toast(1), toast(2)]);
  });

  it("laat de oudste toast verdwijnen zodra de stack de max (3) overschrijdt", () => {
    let stack: ToastItem[] = [];
    stack = pushToast(stack, toast(1));
    stack = pushToast(stack, toast(2));
    stack = pushToast(stack, toast(3));
    stack = pushToast(stack, toast(4));
    expect(stack).toEqual([toast(2), toast(3), toast(4)]);
  });
});
