import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, beforeEach } from "vitest";
import type { Chat } from "../../types/chat";
import { useAppNavigation } from "../useAppNavigation";
import { useStore } from "../../store";

const chatA: Chat = {
  id: "a", name: "Alpha", model: "", provider: "",
  createdAt: "", updatedAt: "",
};

describe("useAppNavigation", () => {
  beforeEach(() => {
    useStore.setState({
      anchorChat: null,
      selectedChats: new Map(),
      isMulti: false,
      selectedIds: undefined,
      chats: [],
    });
  });

  test("given initial state, then section is chats", () => {
    const { result } = renderHook(() => useAppNavigation());
    expect(result.current.section).toBe("chats");
  });

  test("given initial state, then settingsSub is appearance", () => {
    const { result } = renderHook(() => useAppNavigation());
    expect(result.current.settingsSub).toBe("appearance");
  });

  test("given initial state, then selectedLabel is null", () => {
    const { result } = renderHook(() => useAppNavigation());
    expect(result.current.selectedLabel).toBeNull();
  });

  test("given initial state, then searching is false", () => {
    const { result } = renderHook(() => useAppNavigation());
    expect(result.current.searching).toBe(false);
  });

  test("given section change to flagged, then section updates", () => {
    const { result } = renderHook(() => useAppNavigation());
    act(() => result.current.handleSectionChange("flagged"));
    expect(result.current.section).toBe("flagged");
  });

  test("given section change to settings, then section updates", () => {
    const { result } = renderHook(() => useAppNavigation());
    act(() => result.current.handleSectionChange("settings"));
    expect(result.current.section).toBe("settings");
  });

  test("given section change to same section, then no state change", () => {
    const { result } = renderHook(() => useAppNavigation());
    act(() => result.current.handleSectionChange("chats"));
    expect(result.current.section).toBe("chats");
  });

  test("given searching is active, when section changes, then searching resets", () => {
    const { result } = renderHook(() => useAppNavigation());
    act(() => result.current.setSearching(true));
    expect(result.current.searching).toBe(true);
    act(() => result.current.handleSectionChange("flagged"));
    expect(result.current.searching).toBe(false);
  });

  test("given label selected, then selectedLabel updates", () => {
    const { result } = renderHook(() => useAppNavigation());
    act(() => result.current.handleLabelSelect("label-1"));
    expect(result.current.selectedLabel).toBe("label-1");
  });

  test("given label deselected, then selectedLabel is null", () => {
    const { result } = renderHook(() => useAppNavigation());
    act(() => result.current.handleLabelSelect("label-1"));
    act(() => result.current.handleLabelSelect(null));
    expect(result.current.selectedLabel).toBeNull();
  });

  test("given section changes away from labels, then selectedLabel clears", () => {
    const { result } = renderHook(() => useAppNavigation());
    act(() => result.current.handleSectionChange("labels"));
    act(() => result.current.handleLabelSelect("label-1"));
    expect(result.current.selectedLabel).toBe("label-1");
    act(() => result.current.handleSectionChange("chats"));
    expect(result.current.selectedLabel).toBeNull();
  });

  test("given settings sub change, then settingsSub updates", () => {
    const { result } = renderHook(() => useAppNavigation());
    act(() => result.current.handleSettingsSubChange("llm"));
    expect(result.current.settingsSub).toBe("llm");
  });

  test("given multi-select active, when section changes, then collapses to first selected", () => {
    const selected = new Map([["a", chatA]]);
    useStore.setState({ isMulti: true, selectedChats: selected });

    const { result } = renderHook(() => useAppNavigation());
    act(() => result.current.handleSectionChange("flagged"));

    expect(useStore.getState().anchorChat?.id).toBe("a");
    expect(useStore.getState().isMulti).toBe(false);
  });

  test("given multi-select empty, when section changes, then selectChat called with null", () => {
    useStore.setState({ isMulti: true, selectedChats: new Map() });

    const { result } = renderHook(() => useAppNavigation());
    act(() => result.current.handleSectionChange("flagged"));

    expect(useStore.getState().anchorChat).toBeNull();
  });

  test("given no multi-select, when section changes, then anchor unchanged", () => {
    useStore.setState({ isMulti: false, anchorChat: chatA });

    const { result } = renderHook(() => useAppNavigation());
    act(() => result.current.handleSectionChange("flagged"));

    expect(useStore.getState().anchorChat?.id).toBe("a");
  });

  test("given setSearching true, then searching is true", () => {
    const { result } = renderHook(() => useAppNavigation());
    act(() => result.current.setSearching(true));
    expect(result.current.searching).toBe(true);
    act(() => result.current.setSearching(false));
    expect(result.current.searching).toBe(false);
  });
});
