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

  const handleForwardM1 = async () => {
    await invoke("drive_forward", { speed: 100, motor_index: 1 });
  }

  const handleForwardM2 = async () => {
    await invoke("drive_forward", { speed: 100, motor_index: 2});
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
      <div className="motor_buttons">
        <button onClick={handleForwardM1}>Drive M1 Forward</button>
        <button onClick={handleForwardM2}>Drive M2 Forward</button>
      </div>  
    </main>
  );
}

export default App;
