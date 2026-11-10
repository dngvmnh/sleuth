/**
 * Vitest setup file for the web/jsdom project.
 * Extends Vitest's expect with @testing-library/jest-dom matchers
 * (toHaveTextContent, toBeInTheDocument, etc.) and wires automatic
 * cleanup after each test so the DOM is reset between test cases.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
