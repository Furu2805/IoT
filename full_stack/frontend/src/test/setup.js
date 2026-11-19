import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// JSDOM không vẽ canvas; Chart.js được mock riêng để kiểm tra dữ liệu truyền vào.
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
const style = document.createElement("style");
style.textContent = ".page-content:not(.active) { display: none; }";
document.head.appendChild(style);
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.useRealTimers();
});
