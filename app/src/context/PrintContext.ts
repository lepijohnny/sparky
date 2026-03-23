import { createContext, useContext } from "react";

export const PrintContext = createContext(false);

export function usePrintMode(): boolean {
  return useContext(PrintContext);
}
