import { createRoot } from "react-dom/client";
import { html } from "./lib/html.js";
import { App } from "./components/App.js";

createRoot(document.getElementById("root")).render(html`<${App} />`);

