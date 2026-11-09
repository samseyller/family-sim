import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useGame } from './store/gameStore';
import { Title } from './ui/screens/Title';
import { Game } from './ui/screens/Game';
import { installInput } from './ui/input';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

function App() {
  const game = useGame((s) => s.game);
  const init = useGame((s) => s.init);
  const toTitle = useGame((s) => s.toTitle);
  useEffect(() => {
    installInput();
    void init();
  }, [init]);
  return (
    <ErrorBoundary onReset={() => { toTitle(); void init(); }}>
      {game ? <Game /> : <Title />}
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
