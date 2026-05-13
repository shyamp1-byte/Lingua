import { getCurrentWindow } from "@tauri-apps/api/window";
import ControlPanel from "./components/ControlPanel";
import Overlay from "./components/Overlay";
import "./App.css";

const windowLabel = getCurrentWindow().label;

function App() {
  if (windowLabel === "overlay") {
    return <Overlay />;
  }
  return <ControlPanel />;
}

export default App;
