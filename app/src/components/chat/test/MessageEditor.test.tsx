import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageEditor } from "../MessageEditor";

describe("MessageEditor", () => {
  test("given content, when rendered, then textarea shows content", () => {
    render(<MessageEditor content="Hello" onSave={vi.fn()} onCancel={vi.fn()} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Hello");
  });

  test("given editor, when typing and saving, then calls onSave with new content", () => {
    const onSave = vi.fn();
    render(<MessageEditor content="Hello" onSave={onSave} onCancel={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Updated content" } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith("Updated content");
  });

  test("given editor, when cancel clicked, then calls onCancel", () => {
    const onCancel = vi.fn();
    render(<MessageEditor content="Hello" onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  test("given editor, when save without editing, then calls onSave with original content", () => {
    const onSave = vi.fn();
    render(<MessageEditor content="Original" onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith("Original");
  });

  test("given editor, when rendered, then textarea is focused", () => {
    render(<MessageEditor content="Focus me" onSave={vi.fn()} onCancel={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    expect(document.activeElement).toBe(textarea);
  });
});
