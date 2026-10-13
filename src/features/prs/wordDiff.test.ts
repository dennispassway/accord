import { describe, expect, it } from "vitest";
import { type Segment, wordDiff } from "./wordDiff";

const join = (segs: Segment[]) => segs.map((s) => s.text).join("");
const changed = (segs: Segment[]) =>
  segs.filter((s) => s.changed).map((s) => s.text);

describe("wordDiff", () => {
  it("markeert alleen het gewijzigde woord in het midden", () => {
    const r = wordDiff(
      "const total = items.length;",
      "const total = rows.length;",
    );
    expect(changed(r.old)).toEqual(["items"]);
    expect(changed(r.new)).toEqual(["rows"]);
  });

  it("geeft de invoer exact terug bij concatenatie", () => {
    const a = "if (user.isAdmin && flag) { run(1, 2); }";
    const b = "if (user.isOwner && flag) { run(1, 3); }";
    const r = wordDiff(a, b);
    expect(join(r.old)).toBe(a);
    expect(join(r.new)).toBe(b);
  });

  it("geeft bij gelijke regels elk één ongemarkeerd segment", () => {
    expect(wordDiff("same line", "same line")).toEqual({
      old: [{ text: "same line", changed: false }],
      new: [{ text: "same line", changed: false }],
    });
  });

  it("markeert niets als het gemeenschappelijke deel onder 30% blijft", () => {
    const r = wordDiff("alpha beta gamma delta", "x");
    expect(r.old).toEqual([{ text: "alpha beta gamma delta", changed: false }]);
    expect(r.new).toEqual([{ text: "x", changed: false }]);
  });

  it("voegt aaneengesloten segmenten samen en levert geen lege segmenten", () => {
    const r = wordDiff("prefix aaa bbb suffix", "prefix ccc suffix");
    for (const s of [...r.old, ...r.new]) expect(s.text).not.toBe("");
    expect(changed(r.old)).toEqual(["aaa bbb"]);
    expect(changed(r.new)).toEqual(["ccc"]);
  });

  it("markeert een pure invoeging aan één kant", () => {
    const r = wordDiff("call(a)", "call(a, b)");
    expect(changed(r.old)).toEqual([]);
    expect(changed(r.new)).toEqual([", b"]);
  });

  it("splitst op leestekens en witruimte", () => {
    const r = wordDiff("foo.bar(baz)", "foo.qux(baz)");
    expect(changed(r.old)).toEqual(["bar"]);
    expect(changed(r.new)).toEqual(["qux"]);
  });
});
