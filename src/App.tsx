import { useState } from 'react';

type CounterProps = {
  initialValue?: number;
};

export function App({ initialValue = 0 }: CounterProps) {
  const [count, setCount] = useState(initialValue);

  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>ES Server</h1>
      <p>This raw TSX file was served by ES Server and transformed in the browser.</p>

      <button type='button' onClick={() => setCount(value => value + 1)}>
        Count: {count}
      </button>
    </main>
  );
}
