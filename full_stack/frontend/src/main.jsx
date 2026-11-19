import React from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "../css/style.css";
import "./react.css";
import App from "./App.jsx";

// Nạp Bootstrap, Font Awesome và CSS dự án trước khi gắn React vào phần tử #root.
// React quản lý toàn bộ giao diện bên trong root, thay cho các hàm sửa DOM cũ.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
