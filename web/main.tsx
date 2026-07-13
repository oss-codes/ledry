/** @jsxImportSource react */
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app"
import { Showcase } from "./showcase"
import "./styles.css"

if (process.env.NODE_ENV === "development") {
  void import("react-grab")
  void import("react-scan")
}

const root = document.querySelector("#root")
if (root === null) throw new Error("Dashboard root is missing")

const showcase =
  new URLSearchParams(window.location.search).get("showcase") === "1"
createRoot(root).render(
  <StrictMode>{showcase ? <Showcase /> : <App />}</StrictMode>,
)
