import React from "react";
import { describe, expect, it } from "vite-plus/test";
import { highlight } from "../../client/utils/highlight";

type MarkProps = { children: string };

function getMarks(result: unknown): React.ReactElement<MarkProps>[] {
  const parts = result as (string | React.ReactElement<MarkProps>)[];
  return parts.filter(
    (p): p is React.ReactElement<MarkProps> => typeof p === "object" && p !== null,
  );
}

describe("highlight", () => {
  it("returns plain text when q is empty", () => {
    const result = highlight("Hello World", "");
    expect(result).toBe("Hello World");
  });

  it("wraps a single match with mark", () => {
    const result = highlight("Hello World", "World");
    expect(Array.isArray(result)).toBe(true);
    const marks = getMarks(result);
    expect(marks).toHaveLength(1);
    expect(marks[0].type).toBe("mark");
    expect(marks[0].props.children).toBe("World");
  });

  it("is case-insensitive", () => {
    const result = highlight("Hello World", "hello");
    const marks = getMarks(result);
    expect(marks).toHaveLength(1);
    expect(marks[0].props.children).toBe("Hello");
  });

  it("escapes regex special characters (e.g. C++)", () => {
    const result = highlight("Use C++ today", "C++");
    const marks = getMarks(result);
    expect(marks).toHaveLength(1);
    expect(marks[0].props.children).toBe("C++");
  });

  it("wraps multiple matches with mark", () => {
    const result = highlight("foo bar foo", "foo");
    const marks = getMarks(result);
    expect(marks).toHaveLength(2);
    expect(marks[0].props.children).toBe("foo");
    expect(marks[1].props.children).toBe("foo");
  });
});
