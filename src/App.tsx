import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [count, setCount] = useState<number>(0);
  const increment = () => setCount(count + 1);


  async function showCounter() {
    increment();
    await invoke("counter", { count });
    setCounterMsg(`Your count is: ${count}`);
  }

  const handleForward = async () => {
    await invoke("drive_forward_m1", { speed: 100 });
  }


  return (
    <main className="container">

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          showCounter();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => {
            setName(e.currentTarget.value);
          }}
          placeholder="Enter a name..."
        />
      </form>
      <p>{count}</p>
      <button onClick={handleForward}>Drive M1 Forward</button>
    </main>
  );
}

export default App;
