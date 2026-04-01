import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MessageActions } from "../MessageActions";

describe("MessageActions", () => {
  const base = { rowid: 1, turnId: "turn-1", content: "Hello world" };

  test("given message, when rendered, then shows copy button", () => {
    render(<MessageActions {...base} />);
    expect(screen.getByTitle("Copy raw markdown")).toBeDefined();
  });

  test("given onBranch, when branch clicked, then calls with rowid", () => {
    const onBranch = vi.fn();
    render(<MessageActions {...base} onBranch={onBranch} />);
    fireEvent.click(screen.getByTitle("Branch conversation from here"));
    expect(onBranch).toHaveBeenCalledWith(1);
  });

  test("given onToggleAnchor and not anchored, when pin clicked, then calls with rowid and true", () => {
    const onToggleAnchor = vi.fn();
    render(<MessageActions {...base} onToggleAnchor={onToggleAnchor} anchored={false} />);
    fireEvent.click(screen.getByTitle("Pin to context"));
    expect(onToggleAnchor).toHaveBeenCalledWith(1, true);
  });

  test("given onToggleAnchor and anchored, when pin clicked, then calls with rowid and false", () => {
    const onToggleAnchor = vi.fn();
    render(<MessageActions {...base} onToggleAnchor={onToggleAnchor} anchored={true} />);
    fireEvent.click(screen.getByTitle("Unpin from context"));
    expect(onToggleAnchor).toHaveBeenCalledWith(1, false);
  });

  test("given content, when copy clicked, then writes to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<MessageActions {...base} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Copy raw markdown"));
    });
    expect(writeText).toHaveBeenCalledWith("Hello world");
  });

  test("given onEdit and onEditStart, when edit clicked, then calls onEditStart", () => {
    const onEditStart = vi.fn();
    render(<MessageActions {...base} onEdit={vi.fn()} onEditStart={onEditStart} />);
    fireEvent.click(screen.getByTitle("Edit message"));
    expect(onEditStart).toHaveBeenCalled();
  });

  test("given no onEdit, when rendered, then no edit button", () => {
    render(<MessageActions {...base} />);
    expect(screen.queryByTitle("Edit message")).toBeNull();
  });

  test("given onDeleteTurn, when delete clicked, then calls with turnId", () => {
    const onDeleteTurn = vi.fn();
    render(<MessageActions {...base} onDeleteTurn={onDeleteTurn} />);
    fireEvent.click(screen.getByTitle("Delete turn"));
    expect(onDeleteTurn).toHaveBeenCalledWith("turn-1");
  });

  test("given no onDeleteTurn, when rendered, then no delete button", () => {
    render(<MessageActions {...base} />);
    expect(screen.queryByTitle("Delete turn")).toBeNull();
  });

  test("given no onBranch, when rendered, then no branch button", () => {
    render(<MessageActions {...base} />);
    expect(screen.queryByTitle("Branch conversation from here")).toBeNull();
  });
});
