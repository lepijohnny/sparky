import { describe, test, expect, beforeEach } from "vitest";
import { useStore } from "../index";

describe("navigation slice", () => {
  beforeEach(() => {
    useStore.setState({
      section: "chats",
      settingsSub: "appearance",
      selectedLabel: null,
      searching: false,
      searchQuery: "",
    });
  });

  test("given chats section, when setSection to settings, then clears search state", () => {
    useStore.getState().setSearching(true);
    useStore.getState().setSearchQuery("test");
    useStore.getState().setSection("settings");

    expect(useStore.getState().section).toBe("settings");
    expect(useStore.getState().searching).toBe(false);
    expect(useStore.getState().searchQuery).toBe("");
  });

  test("given labels section with label, when setSection to chats, then clears label", () => {
    useStore.setState({ section: "labels", selectedLabel: "lbl-1" });
    useStore.getState().setSection("chats");

    expect(useStore.getState().selectedLabel).toBeNull();
  });

  test("given labels section with label, when setSection to labels, then keeps label", () => {
    useStore.setState({ section: "labels", selectedLabel: "lbl-1" });
    useStore.getState().setSection("labels");

    expect(useStore.getState().selectedLabel).toBe("lbl-1");
  });

  test("given same section, when setSection called again, then no state change", () => {
    useStore.getState().setSearching(true);
    useStore.getState().setSection("chats");

    expect(useStore.getState().searching).toBe(true);
  });

  test("given any state, when setSettingsSub called, then updates sub", () => {
    useStore.getState().setSettingsSub("llm");
    expect(useStore.getState().settingsSub).toBe("llm");
  });

  test("given any state, when setSelectedLabel called, then updates label", () => {
    useStore.getState().setSelectedLabel("lbl-1");
    expect(useStore.getState().selectedLabel).toBe("lbl-1");
  });
});
