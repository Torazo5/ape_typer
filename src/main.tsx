import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const initialPage = window.location.pathname.startsWith("/statistics") ? "statistics" : "test";

createRoot(document.getElementById("root")!).render(<StrictMode><App initialPage={initialPage} /></StrictMode>);
