import Dashboard from './components/Dashboard';
import { UpdateBanner } from './components/UpdateBanner';

/**
 * 根组件，集成主仪表盘
 */
function App() {
  return (
    <div className="h-screen w-screen flex flex-col">
      <UpdateBanner />
      <Dashboard />
    </div>
  );
}

export default App;
